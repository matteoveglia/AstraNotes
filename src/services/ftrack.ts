/**
 * @fileoverview ftrack.ts
 * FTrack service integration handling all API interactions.
 * Features include:
 * - Session management and authentication
 * - Playlist and version fetching
 * - Note publishing and management
 * - Version search and caching
 * - Label management
 */

import type { FtrackSettings, Playlist, Note, AssetVersion } from "../types";
import { Session } from "@ftrack/api";

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log("[FtrackService]", ...args);
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

interface SearchVersionsOptions {
  searchTerm: string;
  limit?: number;
}

export class FtrackService {
  private settings: FtrackSettings | null = null;
  private session: Session | null = null;
  private noteLabels: Array<{
    id: string;
    name: string;
    color: string;
  }> | null = null;
  private currentUserId: string | null = null;

  constructor() {
    const savedSettings = localStorage.getItem("ftrackSettings");
    if (savedSettings) {
      try {
        this.settings = JSON.parse(savedSettings);
        log("Initialized with settings:", {
          serverUrl: this.settings?.serverUrl,
          apiUser: this.settings?.apiUser,
          hasApiKey: this.settings?.apiKey
            ? this.settings?.apiKey.slice(-5)
            : undefined,
        });
        // Initialize session if we have settings
        this.initSession().then(() => {
          // Fetch note labels after session is initialized
          this.fetchNoteLabels();
        });
      } catch (err) {
        console.error("Failed to parse saved settings:", err);
        this.settings = null;
      }
    }
  }

  private async initSession(): Promise<Session | null> {
    if (
      !this.settings?.serverUrl ||
      !this.settings?.apiKey ||
      !this.settings?.apiUser
    ) {
      return null;
    }

    try {
      log("Initializing ftrack session...");
      this.session = new Session(
        this.settings.serverUrl,
        this.settings.apiUser,
        this.settings.apiKey,
        { autoConnectEventHub: false },
      );
      await this.session.initializing;

      // Get user ID during initialization
      const userResult = await this.session.query(
        `select id from User where username is "${this.settings.apiUser}"`,
      );
      if (!userResult?.data?.length) {
        throw new Error("Could not find current user");
      }
      this.currentUserId = userResult.data[0].id;

      log("Successfully initialized ftrack session");
      return this.session;
    } catch (error) {
      log("Failed to initialize session:", error);
      this.session = null;
      this.currentUserId = null;

      // Preserve the original error type and message
      if (error instanceof Error) {
        const authError = new Error(error.message);
        authError.name =
          error.name === "ServerError" ? "ServerError" : "AuthenticationError";
        throw authError;
      } else {
        const authError = new Error("Failed to initialize ftrack session");
        authError.name = "AuthenticationError";
        throw authError;
      }
    }
  }

  async testConnection(): Promise<boolean> {
    log("Testing connection...");

    if (
      !this.settings?.serverUrl ||
      !this.settings?.apiKey ||
      !this.settings?.apiUser
    ) {
      log("Missing settings:", {
        hasServerUrl: !!this.settings?.serverUrl,
        hasApiKey: !!this.settings?.apiKey,
        hasApiUser: !!this.settings?.apiUser,
      });
      return false;
    }

    try {
      const session = await this.initSession();
      if (!session) {
        return false;
      }

      // Try to query the current user to verify connection
      log("Querying user...");
      const userQuery = `select id, username from User where username is "${this.settings.apiUser}"`;
      log("Running query:", userQuery);
      const result = await session.query(userQuery);

      const success = result?.data?.length > 0;
      log("Connection test result:", { success, result });
      return success;
    } catch (error) {
      log("Connection error:", error);
      return false;
    }
  }

  private mapNotesToPlaylist(notes: any[]): Note[] {
    return notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.created_at || new Date().toISOString(),
      updatedAt: note.updated_at || new Date().toISOString(),
      createdById: note.created_by_id,
      frameNumber: note.frame_number,
    }));
  }

  private mapVersionsToPlaylist(versions: any[]): AssetVersion[] {
    return versions.map((version) => {
      //console.debug('[FtrackService] Raw version data:', version);
      // Extract thumbnail ID for later fetching
      let thumbnailId = null;
      if (
        version.asset_version.thumbnail &&
        version.asset_version.thumbnail.id
      ) {
        thumbnailId = version.asset_version.thumbnail.id;
        //console.debug('[FtrackService] Found thumbnail ID:', thumbnailId);
      } else {
        //console.debug('[FtrackService] No thumbnail found for version:', version.asset_version.id);
      }

      return {
        id: version.asset_version.id,
        name: version.asset_version.asset.name,
        version: version.asset_version.version,
        reviewSessionObjectId: version.id,
        thumbnailId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async getPlaylistNotes(playlistId: string): Promise<Note[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log("No active session for getPlaylistNotes");
        return [];
      }
    }

    try {
      log("Fetching notes for playlist:", playlistId);
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

      log("Running notes query:", query);
      const result = await this.session!.query(query);

      log("Raw notes response:", result);
      log("Number of notes found:", result?.data?.length || 0);

      return this.mapNotesToPlaylist(result?.data || []);
    } catch (error) {
      log("Failed to fetch notes:", error);
      return [];
    }
  }

  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log("No active session for getPlaylistVersions");
        return [];
      }
    }

    try {
      log("Fetching versions for playlist:", playlistId);
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

      log("Running versions query:", query);
      const result = await this.session!.query(query);

      log("Raw versions response:", result);
      log("Number of versions found:", result?.data?.length || 0);

      return this.mapVersionsToPlaylist(result?.data || []);
    } catch (error) {
      log("Failed to fetch versions:", error);
      return [];
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log("No active session for getPlaylists");
        return [];
      }
    }

    try {
      log("Fetching review sessions...");
      const query = `select 
        id,
        name,
        created_at,
        end_date,
        created_by_id,
        project_id
      from ReviewSession 
      order by created_at desc`;

      log("Running query:", query);
      const result = await this.session!.query(query);

      log("Received review sessions:", result);

      return (result?.data || []).map((session) => ({
        id: session.id,
        name: session.name,
        title: session.name,
        notes: [], // Notes will be loaded when playlist is selected
        createdAt: session.created_at,
        updatedAt: session.end_date || session.created_at,
        isQuickNotes: false,
      }));
    } catch (error) {
      log("Failed to fetch playlists:", error);
      return [];
    }
  }

  async publishNote(
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<void> {
    const session = await this.getSession();

    try {
      if (!this.currentUserId) {
        throw new Error(
          "No user ID available - session may not be properly initialized",
        );
      }

      // Process content for better markdown rendering in ftrack
      // Replace single newlines with double newlines
      const processedContent = content.replace(/\n/g, '\n\n');

      // Create note
      const response = await session.create("Note", {
        content: processedContent,
        parent_id: versionId,
        parent_type: "AssetVersion",
        user_id: this.currentUserId,
      });

      // Check for successful response
      if (!response?.data?.id) {
        log("Invalid response:", response);
        throw new Error("Failed to create note: Invalid response from server");
      }

      const noteId = response.data.id;

      // Link note to label if provided
      if (labelId) {
        await session.create("NoteLabelLink", {
          note_id: noteId,
          label_id: labelId,
        });
      }

      log("Successfully published note:", {
        noteId,
        versionId,
        labelId,
      });
    } catch (error) {
      log("Failed to publish note:", error);
      throw error;
    }
  }

  async getSession(): Promise<Session> {
    if (!this.session) {
      this.session = await this.initSession();
      if (!this.session) {
        const error = new Error("Failed to initialize ftrack session");
        error.name = "AuthenticationError";
        throw error;
      }
    }
    return this.session;
  }

  async ensureSession(): Promise<Session> {
    if (!this.session) {
      this.session = await this.initSession();
      if (!this.session) {
        const error = new Error("Failed to initialize ftrack session");
        error.name = "AuthenticationError";
        throw error;
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

  async searchVersions(
    options: SearchVersionsOptions,
  ): Promise<AssetVersion[]> {
    const { searchTerm, limit = 50 } = options;
    const session = await this.ensureSession();
    const cacheKey = JSON.stringify(options);

    // Check cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      log("Searching versions:", options);

      // Only parse version if it's explicitly marked with v or _v
      const versionMatch = searchTerm.match(/[_]?v(\d+)/i);
      // Remove the version part from search if found, otherwise use full search term
      const nameSearch = versionMatch
        ? searchTerm.replace(/[_]?v\d+/i, "").trim()
        : searchTerm.trim();

      // Build where clause to search by name and/or version
      let whereClause = "";
      if (nameSearch) {
        whereClause += `asset.name like "%${nameSearch}%"`;
      }
      if (versionMatch) {
        if (whereClause) whereClause += " and ";
        whereClause += `version = ${versionMatch[1]}`;
      }
      // If no valid search criteria, return empty results
      if (!whereClause) {
        return [];
      }

      const query = `select 
        id,
        version,
        asset.name,
        thumbnail.id,
        thumbnail.name,
        thumbnail.component_locations,
        date
      from AssetVersion 
      where ${whereClause}
      order by date desc
      limit ${limit * 2}`; // Double the limit to account for filtering

      log("Running search query:", query);
      const result = await session.query(query);

      log("Raw search response:", {
        count: result?.data?.length,
        names: result?.data?.map((v) => v.asset.name),
      });

      // Filter results case-insensitively in JavaScript
      const filteredData = nameSearch
        ? result?.data?.filter((v) =>
            v.asset.name.toLowerCase().includes(nameSearch.toLowerCase()),
          )
        : result?.data;

      // Take only up to the requested limit after filtering
      const limitedData = filteredData?.slice(0, limit);

      const versions =
        limitedData?.map((version) => {
          let thumbnailId = null;
          if (version.thumbnail && version.thumbnail.id) {
            thumbnailId = version.thumbnail.id;
          }

          return {
            id: version.id,
            name: version.asset.name,
            version: version.version,
            thumbnailId,
            createdAt: version.date || new Date().toISOString(),
            updatedAt: version.date || new Date().toISOString(),
            manuallyAdded: true,
          };
        }) || [];

      // Cache the results
      await this.addToCache(cacheKey, versions);

      return versions;
    } catch (error) {
      log("Failed to search versions:", error);
      return [];
    }
  }

  private async getFromCache(key: string): Promise<AssetVersion[] | null> {
    const cached = localStorage.getItem(`version_search_${key}`);
    if (cached) {
      const { versions, timestamp } = JSON.parse(cached);
      // Cache expires after 5 minutes
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        return versions;
      }
    }
    return null;
  }

  private async addToCache(
    key: string,
    versions: AssetVersion[],
  ): Promise<void> {
    localStorage.setItem(
      `version_search_${key}`,
      JSON.stringify({
        versions,
        timestamp: Date.now(),
      }),
    );
  }

  private async fetchNoteLabels(): Promise<void> {
    try {
      const session = await this.getSession();
      const result = await session.query(
        "select id, name, color from NoteLabel",
      );

      log("Fetched note labels:", result?.data);

      if (result?.data) {
        this.noteLabels = result.data.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }));
      }
    } catch (error) {
      log("Failed to fetch note labels:", error);
    }
  }

  async getNoteLabels(): Promise<
    Array<{ id: string; name: string; color: string }>
  > {
    if (!this.noteLabels) {
      await this.fetchNoteLabels();
    }
    return this.noteLabels || [];
  }

  async getVersions(playlistId: string): Promise<
    Array<{
      id: string;
      name: string;
      version: number;
      thumbnail_url?: URL;
      createdAt: string;
      updatedAt: string;
      reviewSessionObjectId?: string;
      thumbnailUrl?: string;
    }>
  > {
    const session = await this.getSession();

    try {
      const result = await session.query(
        `select id, name, version, thumbnail_url, created_at, updated_at, review_session_object_id, thumbnail_url from AssetVersion where playlist_id = "${playlistId}"`,
      );

      if (!result?.data) {
        return [];
      }

      return result.data.map((version) => ({
        id: version.id,
        name: version.name,
        version: version.version,
        thumbnail_url: version.thumbnail_url,
        createdAt: version.created_at,
        updatedAt: version.updated_at,
        reviewSessionObjectId: version.review_session_object_id,
        thumbnailUrl: version.thumbnail_url,
      }));
    } catch (error) {
      log("Failed to fetch versions:", error);
      throw error;
    }
  }

  updateSettings(settings: FtrackSettings) {
    log("Updating settings:", {
      serverUrl: settings.serverUrl,
      apiUser: settings.apiUser,
      hasApiKey: !!settings.apiKey,
    });

    // Validate settings
    if (!settings.serverUrl || !settings.apiKey || !settings.apiUser) {
      throw new Error("Invalid settings: all fields are required");
    }

    // Remove trailing slash from server URL if present
    settings.serverUrl = settings.serverUrl.replace(/\/$/, "");

    this.settings = settings;
    localStorage.setItem("ftrackSettings", JSON.stringify(settings));

    // Initialize new session with updated settings
    this.initSession();
  }
}

export const ftrackService = new FtrackService();
