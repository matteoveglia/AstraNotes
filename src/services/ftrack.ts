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
        date,
        user_id,
        frame_number
      from Note 
      where review_session_object.review_session.id is "${playlistId}"
      order by date desc`;
      
      log('Running notes query:', query);
      const result = await this.session!.query(query);

      log('Raw notes response:', result);
      log('Number of notes found:', result?.data?.length || 0);

      return (result?.data || []).map(note => {
        log('Processing note:', note);
        return {
          id: note.id,
          content: note.content,
          createdAt: note.date,
          createdById: note.user_id,
          frameNumber: note.frame_number
        };
      });
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

      return (result?.data || []).map(version => {
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
          thumbnailUrl
        };
      });
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
    const session = await this.getSession();
    // TODO: Implement actual note publishing to ftrack
    // This is a placeholder that logs the action
    console.log(`Publishing note for version ${versionId}:`, content);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
  }

  async getSession(): Promise<Session> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        throw new Error('No active session');
      }
    }
    return this.session;
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
