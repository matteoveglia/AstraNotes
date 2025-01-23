import type { FtrackSettings, Playlist, Note, AssetVersion } from '../types';
import { Session } from '@ftrack/api';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[FtrackService]', ...args);
  }
}

interface ReviewSession {
  id: string;
  name: string;
  created_at: string;
  end_date: string | null;
}

interface FtrackNote {
  id: string;
  content: string;
  parent_id: string;
}

interface CreateResponse {
  id: string;
  [key: string]: any;
}

class FtrackService {
  private settings: FtrackSettings | null = null;
  private session: Session | null = null;

  constructor() {
    const savedSettings = localStorage.getItem('ftrackSettings');
    if (savedSettings) {
      try {
        this.settings = JSON.parse(savedSettings);
        log('Initialized with settings:', {
          serverUrl: this.settings?.serverUrl,
          apiUser: this.settings?.apiUser,
          hasApiKey: !!this.settings?.apiKey
        });
        // Initialize session if we have settings
        this.initSession();
      } catch (err) {
        console.error('Failed to parse saved settings:', err);
        this.settings = null;
      }
    }
  }

  private async initSession(): Promise<Session | null> {
    if (!this.settings?.serverUrl || !this.settings?.apiKey || !this.settings?.apiUser) {
      return null;
    }

    try {
      log('Initializing ftrack session...');
      this.session = new Session(
        this.settings.serverUrl,
        this.settings.apiUser,
        this.settings.apiKey,
        { autoConnectEventHub: false }
      );
      await this.session.initializing;
      log('Successfully initialized ftrack session');
      return this.session;
    } catch (error) {
      log('Failed to initialize session:', error);
      this.session = null;
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    log('Testing connection...');
    
    if (!this.settings?.serverUrl || !this.settings?.apiKey || !this.settings?.apiUser) {
      log('Missing settings:', {
        hasServerUrl: !!this.settings?.serverUrl,
        hasApiKey: !!this.settings?.apiKey,
        hasApiUser: !!this.settings?.apiUser
      });
      return false;
    }

    try {
      const session = await this.initSession();
      if (!session) {
        return false;
      }

      // Try to query the current user to verify connection
      log('Querying user...');
      const userQuery = `select id, username from User where username is "${this.settings.apiUser}"`;
      log('Running query:', userQuery);
      const result = await session.query(userQuery);
      
      const success = result?.data?.length > 0;
      log('Connection test result:', { success, result });
      return success;
    } catch (error) {
      log('Connection error:', error);
      return false;
    }
  }

  private mapNotesToPlaylist(notes: any[]): Note[] {
    return notes.map(note => ({
      id: note.id,
      content: note.content,
      createdAt: note.created_at || new Date().toISOString(),
      updatedAt: note.updated_at || new Date().toISOString(),
      createdById: note.created_by_id,
      frameNumber: note.frame_number
    }));
  }

  private mapVersionsToPlaylist(versions: any[]): AssetVersion[] {
    return versions.map(version => {
      // Extract thumbnail URL
      let thumbnailUrl = '';
      const thumbnail = version.asset_version.thumbnail;
      if (thumbnail && thumbnail.component_locations && thumbnail.component_locations.length > 0) {
        // Get the first available component location's URL
        thumbnailUrl = thumbnail.component_locations[0].url;
      }

      return {
        id: version.asset_version.id,
        name: version.asset_version.asset.name,
        version: version.asset_version.version,
        reviewSessionObjectId: version.id,
        thumbnailUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  }

  async getPlaylistNotes(playlistId: string): Promise<Note[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log('No active session for getPlaylistNotes');
        return [];
      }
    }

    try {
      log('Fetching notes for playlist:', playlistId);
      const query = `select 
        id,
        content,
        created_at,
        updated_at,
        created_by_id,
        frame_number
      from Note 
      where review_session_object.review_session.id is "${playlistId}"
      order by created_at desc`;
      
      log('Running notes query:', query);
      const result = await this.session!.query(query);

      log('Raw notes response:', result);
      log('Number of notes found:', result?.data?.length || 0);

      return this.mapNotesToPlaylist(result?.data || []);
    } catch (error) {
      log('Failed to fetch notes:', error);
      return [];
    }
  }

  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log('No active session for getPlaylistVersions');
        return [];
      }
    }

    try {
      log('Fetching versions for playlist:', playlistId);
      const query = `select 
        asset_version.id,
        asset_version.version,
        asset_version.asset.name,
        asset_version.thumbnail.id,
        asset_version.thumbnail.name,
        asset_version.thumbnail.component_locations,
        id
      from ReviewSessionObject 
      where review_session.id is "${playlistId}"
      order by sort_order`;
      
      log('Running versions query:', query);
      const result = await this.session!.query(query);

      log('Raw versions response:', result);
      log('Number of versions found:', result?.data?.length || 0);

      return this.mapVersionsToPlaylist(result?.data || []);
    } catch (error) {
      log('Failed to fetch versions:', error);
      return [];
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log('No active session for getPlaylists');
        return [];
      }
    }

    try {
      log('Fetching review sessions...');
      const query = `select 
        id,
        name,
        created_at,
        end_date,
        created_by_id,
        project_id
      from ReviewSession 
      order by created_at desc`;
      
      log('Running query:', query);
      const result = await this.session!.query(query);

      log('Received review sessions:', result);

      return (result?.data || []).map(session => ({
        id: session.id,
        name: session.name,
        title: session.name,
        notes: [], // Notes will be loaded when playlist is selected
        createdAt: session.created_at,
        updatedAt: session.end_date || session.created_at,
        isQuickNotes: false
      }));
    } catch (error) {
      log('Failed to fetch playlists:', error);
      return [];
    }
  }

  async publishNote(versionId: string, content: string): Promise<void> {
    const session = await this.ensureSession();
    
    // Create note in ftrack
    const response = await session.create('Note', {
      content: content,
      parent_id: versionId,
    });

    // Type guard to ensure response has an id
    if (!response || typeof response !== 'object' || !('id' in response)) {
      throw new Error('Failed to create note: Invalid response from server');
    }

    log('Published note:', { versionId, noteId: response.id });
  }

  async getSession(): Promise<Session> {
    if (!this.session) {
      this.session = await this.initSession();
      if (!this.session) {
        throw new Error('Failed to initialize ftrack session');
      }
    }
    return this.session;
  }

  async ensureSession(): Promise<Session> {
    if (!this.session) {
      this.session = await this.initSession();
      if (!this.session) {
        throw new Error('Failed to initialize ftrack session');
      }
    }
    return this.session;
  }

  async testConnectionNew(): Promise<boolean> {
    try {
      await this.ensureSession();
      return true;
    } catch (error) {
      return false;
    }
  }

  updateSettings(settings: FtrackSettings) {
    log('Updating settings:', {
      serverUrl: settings.serverUrl,
      apiUser: settings.apiUser,
      hasApiKey: !!settings.apiKey
    });
    
    // Validate settings
    if (!settings.serverUrl || !settings.apiKey || !settings.apiUser) {
      throw new Error('Invalid settings: all fields are required');
    }

    // Remove trailing slash from server URL if present
    settings.serverUrl = settings.serverUrl.replace(/\/$/, '');
    
    this.settings = settings;
    localStorage.setItem('ftrackSettings', JSON.stringify(settings));
    
    // Initialize new session with updated settings
    this.initSession();
  }
}

export const ftrackService = new FtrackService();
