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

import type { FtrackSettings, Playlist, Note, AssetVersion } from "@/types";
import { Session } from "@ftrack/api";
import { Attachment } from "@/components/NoteAttachments";
import { AttachmentService } from "./attachmentService";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelData {
  versionId: string;
  versionStatusId: string;
  taskId?: string;
  taskStatusId?: string;
  parentId?: string;
  parentStatusId?: string;
  parentType?: string;
  projectId: string;
}

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

  // --- New status mapping logic ---
  private statusMapping: {
    [objectType: string]: {
      workflowSchemaId: string;
      statuses: Status[];
    };
  } = {};
  private allStatuses: Status[] = [];
  private allObjectTypes: any[] = [];
  private allWorkflowSchemas: any[] = [];
  private allOverrides: any[] = [];
  private statusMappingReady = false;

  // --- ProjectSchema/ObjectType/Status mapping logic ---
  /**
   * Mapping: { [projectSchemaId]: { [objectTypeName]: Status[] } }
   */
  private schemaStatusMapping: {
    [projectSchemaId: string]: {
      [objectTypeName: string]: Status[];
    };
  } = {};
  private schemaStatusMappingReady = false;

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
          // Fetch all status data for mapping
          this.fetchAllStatusData();
          // Fetch all schema status data for project/objecttype mapping
          this.fetchAllSchemaStatusData();
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
  ): Promise<string | null> {
    const session = await this.getSession();

    try {
      if (!this.currentUserId) {
        throw new Error(
          "No user ID available - session may not be properly initialized",
        );
      }

      // Process content for better markdown rendering in ftrack
      // Replace single newlines with double newlines
      const processedContent = content.replace(/\n/g, "\n\n");

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

      return noteId;
    } catch (error) {
      log("Failed to publish note:", error);
      throw error;
    }
  }

  /**
   * Publish a note with attachments to ftrack
   * @param versionId The ID of the version to attach the note to
   * @param content The note content
   * @param labelId Optional label ID
   * @param attachments Optional array of attachments
   * @returns The created note ID if successful
   */
  async publishNoteWithAttachments(
    versionId: string,
    content: string,
    labelId?: string,
    attachments?: Attachment[],
  ): Promise<string | null> {
    const session = await this.getSession();

    try {
      if (!this.currentUserId) {
        throw new Error(
          "No user ID available - session may not be properly initialized",
        );
      }

      // Process content for better markdown rendering in ftrack
      // Replace single newlines with double newlines
      const processedContent = content.replace(/\n/g, "\n\n");

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

      // Handle attachments if any
      if (attachments && attachments.length > 0) {
        log(`Uploading ${attachments.length} attachments for note ${noteId}`);

        // Upload all attachments
        const uploadResult = await AttachmentService.uploadAttachments(
          session,
          attachments,
        );

        if (uploadResult.componentIds.length > 0) {
          // Attach uploaded components to the note
          await AttachmentService.attachComponentsToNote(
            session,
            noteId,
            uploadResult.componentIds,
          );

          log(
            `Successfully attached ${uploadResult.componentIds.length} components to note ${noteId}`,
          );
        }

        if (uploadResult.failed.length > 0) {
          console.warn(
            `Failed to upload ${uploadResult.failed.length} attachments`,
          );
        }
      }

      log("Successfully published note:", {
        noteId,
        versionId,
        labelId,
        attachmentsCount: attachments?.length || 0,
      });

      return noteId;
    } catch (error) {
      log("Failed to publish note:", error);
      throw error;
    }
  }

  /**
   * Publish a note with attachments to ftrack using the web UI style attachment upload
   * This method uses the exact pattern that the ftrack web UI uses, which fixes attachment display issues
   * @param versionId The ID of the version to attach the note to
   * @param content The note content
   * @param labelId Optional label ID
   * @param attachments Optional array of attachments
   * @returns The created note ID if successful
   */
  async publishNoteWithAttachmentsWebUI(
    versionId: string,
    content: string,
    labelId?: string,
    attachments?: Attachment[],
  ): Promise<string | null> {
    const session = await this.getSession();

    try {
      if (!this.currentUserId) {
        throw new Error(
          "No user ID available - session may not be properly initialized",
        );
      }

      // Process content for better markdown rendering in ftrack
      // Replace single newlines with double newlines
      const processedContent = content.replace(/\n/g, "\n\n");

      if (attachments?.length) {
        // If we have attachments, use the combined upload and note creation approach
        log(
          `Creating note with ${attachments.length} attachments using web UI pattern`,
        );

        const result = await AttachmentService.createNoteWithAttachmentsWebUI(
          session,
          processedContent,
          versionId,
          "AssetVersion",
          attachments,
        );

        if (!result.success || !result.noteId) {
          throw new Error("Failed to create note with attachments");
        }

        const noteId = result.noteId;

        // Link note to label if provided
        if (labelId) {
          await session.create("NoteLabelLink", {
            note_id: noteId,
            label_id: labelId,
          });
        }

        // Link note to user
        if (this.currentUserId) {
          try {
            await session.create("NoteUserLink", {
              note_id: noteId,
              user_id: this.currentUserId,
            });
          } catch (userLinkError) {
            console.warn("Could not link note to user:", userLinkError);
          }
        }

        log("Successfully published note with web UI style attachments:", {
          noteId,
          versionId,
          labelId,
          attachmentsUploaded: result.attachmentResults?.uploaded || 0,
          attachmentsFailed: result.attachmentResults?.failed || 0,
        });

        return noteId;
      } else {
        // If no attachments, just create a note normally
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
          throw new Error(
            "Failed to create note: Invalid response from server",
          );
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

        return noteId;
      }
    } catch (error) {
      log("Failed to publish note:", error);
      throw error;
    }
  }

  /**
   * Publish a note with attachments to ftrack using the official createComponent method
   * This approach uses the built-in ftrack API methods for the most reliable upload
   * @param versionId The ID of the version to attach the note to
   * @param content The note content
   * @param labelId Optional label ID
   * @param attachments Optional array of attachments
   * @returns The created note ID if successful
   */
  async publishNoteWithAttachmentsAPI(
    versionId: string,
    content: string,
    labelId?: string,
    attachments?: Attachment[],
  ): Promise<string | null> {
    const session = await this.getSession();

    try {
      if (!this.currentUserId) {
        throw new Error(
          "No user ID available - session may not be properly initialized",
        );
      }

      // Process content for better markdown rendering in ftrack
      // Replace single newlines with double newlines
      const processedContent = content.replace(/\n/g, "\n\n");

      if (attachments?.length) {
        // If we have attachments, use the API-based upload approach
        log(
          `Creating note with ${attachments.length} attachments using API createComponent`,
        );

        const result = await AttachmentService.createNoteWithAttachmentsAPI(
          session,
          processedContent,
          versionId,
          "AssetVersion",
          attachments,
          this.currentUserId, // Pass the user ID to properly link the note
        );

        if (!result.success || !result.noteId) {
          const errorDetails = result.attachmentResults?.errors
            ?.map((e) => e.message)
            .join("; ");
          const errorMessage = `Failed to create note with attachments: ${errorDetails || "Unknown error"}`;
          log(errorMessage);
          throw new Error(errorMessage);
        }

        const noteId = result.noteId;

        // Link note to label if provided
        if (labelId) {
          await session.create("NoteLabelLink", {
            note_id: noteId,
            label_id: labelId,
          });
        }

        log("Successfully published note with API upload attachments:", {
          noteId,
          versionId,
          labelId,
          attachmentsUploaded: result.attachmentResults?.uploaded || 0,
          attachmentsFailed: result.attachmentResults?.failed || 0,
        });

        return noteId;
      } else {
        // If no attachments, just create a note normally
        const response = await session.create("Note", {
          content: processedContent,
          parent_id: versionId,
          parent_type: "AssetVersion",
          user_id: this.currentUserId,
        });

        // Check for successful response
        if (!response?.data?.id) {
          log("Invalid response:", response);
          throw new Error(
            "Failed to create note: Invalid response from server",
          );
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

        return noteId;
      }
    } catch (error) {
      log("Failed to publish note:", error);
      throw error;
    }
  }

  /**
   * Get file URL for a component
   * @param componentId The component ID
   * @returns The URL to access the file
   */
  async getComponentUrl(componentId: string): Promise<string | null> {
    try {
      const session = await this.getSession();

      // Get the server location
      const serverLocationQuery = await session.query(
        'select Location where name is "ftrack.server"',
      );
      const serverLocation = serverLocationQuery.data[0];

      if (!serverLocation) {
        throw new Error("Could not find ftrack server location");
      }

      // Get component
      const componentQuery = await session.query(
        `select id, name from Component where id is "${componentId}"`,
      );
      const component = componentQuery.data[0];

      if (!component) {
        throw new Error(`Component not found: ${componentId}`);
      }

      // Get URL for the component
      const url = session.getComponentUrl(component.id);

      if (!url) {
        throw new Error(`Could not get URL for component: ${componentId}`);
      }

      return url;
    } catch (error) {
      console.error("Failed to get component URL:", error);
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

  /**
   * Get the HTTP API key from the API
   */
  private async getApiKey(session: Session, username: string) {
    console.log("Getting API key for user:", username);

    try {
      // Get the server location - using safer query approach
      const serverLocationQuery = await session.query(
        "select Location where name is 'ftrack.server'",
      );

      // Add fallback if the query fails
      let serverLocation: { [key: string]: any } | undefined =
        serverLocationQuery.data[0];

      if (!serverLocation) {
        console.log("Trying alternative query for server location...");
        // Try alternative approach to get the server location
        try {
          const locationsQuery = await session.query("select Location");
          console.log(`Found ${locationsQuery.data.length} locations`);

          serverLocation = locationsQuery.data.find(
            (loc: any) => loc.name === "ftrack.server",
          );

          if (serverLocation) {
            console.log(
              "Found server location via alternative query:",
              serverLocation.id,
            );
          }
        } catch (altQueryError) {
          console.error("Alternative query failed:", altQueryError);
        }
      }

      if (!serverLocation) {
        throw new Error("Could not find ftrack server location");
      }

      // Rest of the method...
    } catch (error) {
      console.error("Error getting API key:", error);
      throw error;
    }
  }

  /**
   * Get components for a version
   * @param versionId The AssetVersion ID
   * @returns Array of component objects
   */
  async getVersionComponents(versionId: string): Promise<any[]> {
    try {
      const session = await this.getSession();

      // Using query to get all components linked to the version
      const query = await session.query(
        `select Component from Component where version_id is ${versionId}`,
      );

      return query.data;
    } catch (error) {
      log("Error getting components for version:", error);
      return [];
    }
  }

  /**
   * Fetch applicable statuses for a given entity type and ID
   */
  async fetchApplicableStatuses(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    try {
      const session = await this.getSession();

      // 1. Get Project Schema ID and Object Type ID (if applicable) from the entity
      log(
        `[fetchApplicableStatuses] entityType: ${entityType}, entityId: ${entityId}`,
      );
      let projection = "project.project_schema_id";
      if (entityType !== "AssetVersion" && entityType !== "Task") {
        projection += ", object_type_id";
      }
      const entityQuery = await session.query(
        `select ${projection} from ${entityType} where id is "${entityId}"`,
      );

      if (!entityQuery.data || entityQuery.data.length === 0) {
        log(
          `[fetchApplicableStatuses] Entity not found: ${entityType} ${entityId}`,
        );
        throw new Error(`Entity ${entityType} with id ${entityId} not found.`);
      }
      const entityData = entityQuery.data[0];
      const schemaId = entityData.project.project_schema_id;
      const objectTypeId = entityData.object_type_id;
      log(
        `[fetchApplicableStatuses] schemaId: ${schemaId}, objectTypeId: ${objectTypeId}`,
      );

      // 2. Get the Project Schema details, explicitly selecting the overrides relationship
      const schemaQuery = await session.query(
        `select
          asset_version_workflow_schema_id,
          task_workflow_schema_id,
          task_workflow_schema_overrides.type_id,
          task_workflow_schema_overrides.workflow_schema_id
        from ProjectSchema
        where id is "${schemaId}"`,
      );
      log(
        "[fetchApplicableStatuses] Raw ProjectSchema query result:",
        schemaQuery,
      );

      if (!schemaQuery.data?.[0]) {
        log("[fetchApplicableStatuses] Could not find workflow schema");
        throw new Error("Could not find workflow schema");
      }

      const schema = schemaQuery.data[0];
      let workflowSchemaId: string | null = null;

      switch (entityType) {
        case "AssetVersion":
          workflowSchemaId = schema.asset_version_workflow_schema_id;
          break;
        case "Task":
          workflowSchemaId = schema.task_workflow_schema_id;
          break;
        default: {
          log(
            `[fetchApplicableStatuses] Handling default case for entityType: ${entityType}, objectTypeId: ${objectTypeId}`,
          );
          const overrides = schema.task_workflow_schema_overrides;
          log(
            "[fetchApplicableStatuses] Fetched overrides:",
            JSON.stringify(overrides, null, 2),
          );

          if (objectTypeId && overrides && Array.isArray(overrides)) {
            const override = overrides.find(
              (ov: any) => ov && ov.type_id === objectTypeId,
            );
            log(
              `[fetchApplicableStatuses] Searching for override with type_id: ${objectTypeId}`,
            );
            if (override && override.workflow_schema_id) {
              workflowSchemaId = override.workflow_schema_id;
              log(
                `[fetchApplicableStatuses] Override Found! Using workflow override for Object Type ${objectTypeId}: ${workflowSchemaId}`,
              );
            } else {
              log(
                `[fetchApplicableStatuses] No specific override found for type_id: ${objectTypeId} in the fetched overrides.`,
              );
            }
          } else {
            log(
              `[fetchApplicableStatuses] No overrides array found or objectTypeId is missing. Overrides: ${JSON.stringify(overrides)}`,
            );
          }

          if (!workflowSchemaId) {
            workflowSchemaId = schema.task_workflow_schema_id;
            log(
              `[fetchApplicableStatuses] No override applied for ${entityType} (Object Type ${objectTypeId || "N/A"}), using default task workflow: ${workflowSchemaId}`,
            );
          }
          break;
        }
      }

      if (!workflowSchemaId) {
        log(
          `[fetchApplicableStatuses] No workflow schema found for ${entityType}`,
        );
        throw new Error(`No workflow schema found for ${entityType}`);
      }

      // Get the statuses from the workflow schema
      const statusQuery = await session.query(
        `select statuses.id, statuses.name, statuses.color
        from WorkflowSchema
        where id is "${workflowSchemaId}"`,
      );

      log(
        `[fetchApplicableStatuses] statusQuery.data:`,
        JSON.stringify(statusQuery.data, null, 2),
      );
      if (!statusQuery.data?.[0]?.statuses) {
        log(
          `[fetchApplicableStatuses] No statuses found in workflow schema ${workflowSchemaId}`,
        );
        return [];
      }

      log(
        `[fetchApplicableStatuses] Returning statuses for ${entityType} (${entityId}):`,
        statusQuery.data[0].statuses,
      );
      return statusQuery.data[0].statuses.map((status: any) => ({
        id: status.id,
        name: status.name,
        color: status.color,
      }));
    } catch (error) {
      log("Failed to fetch applicable statuses:", error);
      throw error;
    }
  }

  /**
   * Fetch all necessary data for the status panel
   */
  async fetchStatusPanelData(assetVersionId: string): Promise<StatusPanelData> {
    try {
      const session = await this.getSession();
      if (!session) throw new Error("No active ftrack session");

      // Fetch the asset version and its parent shot with their status IDs
      const query = `select 
        id,
        status_id,
        asset.parent.id,
        asset.parent.name,
        asset.parent.status_id,
        asset.parent.object_type.name,
        asset.parent.project.id
      from AssetVersion 
      where id is "${assetVersionId}"`;

      const result = await session.query(query);
      const version = result.data[0];

      if (!version) {
        throw new Error("Asset version not found");
      }

      // Get the shot (parent) details
      const parent = version.asset.parent;

      return {
        versionId: version.id,
        versionStatusId: version.status_id,
        parentId: parent.id,
        parentStatusId: parent.status_id,
        parentType: parent.object_type.name,
        projectId: parent.project.id,
      };
    } catch (error) {
      console.error("Error fetching status panel data:", error);
      throw error;
    }
  }

  /**
   * Update the status of an entity
   */
  async updateEntityStatus(
    entityType: string,
    entityId: string,
    statusId: string,
  ): Promise<void> {
    try {
      const session = await this.getSession();
      await session.update(entityType, entityId, { status_id: statusId });
    } catch (error) {
      log("Failed to update entity status:", error);
      throw error;
    }
  }

  /**
   * Fetch all statuses, object types, workflow schemas, and overrides for the current project schema
   * and build a mapping for fast status lookup.
   */
  async fetchAllStatusData(): Promise<void> {
    try {
      const session = await this.getSession();
      // 1. Fetch all statuses
      const statusResult = await session.query(
        "select id, name, color from Status",
      );
      this.allStatuses = statusResult.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
      }));
      log("[StatusMapping] All statuses:", this.allStatuses);

      // 2. Fetch all object types
      const objectTypeResult = await session.query(
        "select id, name from ObjectType",
      );
      this.allObjectTypes = objectTypeResult.data;
      log("[StatusMapping] All object types:", this.allObjectTypes);

      // 3. Fetch all workflow schemas (with statuses)
      const workflowSchemaResult = await session.query(
        "select id, name, statuses.id, statuses.name, statuses.color from WorkflowSchema",
      );
      this.allWorkflowSchemas = workflowSchemaResult.data;
      log("[StatusMapping] All workflow schemas:", this.allWorkflowSchemas);

      // 4. Fetch all project schema overrides for the current project schema
      // First, get the current project schema id (from any entity, e.g., current user)
      const userResult = await session.query(
        `select project.project_schema_id from User where username is "${this.settings?.apiUser}"`,
      );
      const schemaId = userResult.data[0]?.project?.project_schema_id;
      if (!schemaId) {
        log("[StatusMapping] Could not determine current project schema id");
        return;
      }
      const overrideResult = await session.query(
        `select type_id, workflow_schema_id from ProjectSchemaOverride where project_schema_id is "${schemaId}"`,
      );
      this.allOverrides = overrideResult.data;
      log("[StatusMapping] All project schema overrides:", this.allOverrides);

      // 5. Fetch the ProjectSchema itself for default workflow schema ids
      const schemaResult = await session.query(
        `select asset_version_workflow_schema_id, task_workflow_schema_id from ProjectSchema where id is "${schemaId}"`,
      );
      const schema = schemaResult.data[0];
      log("[StatusMapping] ProjectSchema:", schema);

      // 6. Build mapping for each object type
      this.statusMapping = {};
      for (const objType of this.allObjectTypes) {
        let workflowSchemaId: string | null = null;
        // Check for override
        const override = this.allOverrides.find(
          (ov: any) => ov.type_id === objType.id,
        );
        if (override) {
          workflowSchemaId = override.workflow_schema_id;
          log(
            `[StatusMapping] Override for ${objType.name}: ${workflowSchemaId}`,
          );
        } else {
          // Use default
          if (objType.name === "AssetVersion") {
            workflowSchemaId = schema.asset_version_workflow_schema_id;
          } else {
            workflowSchemaId = schema.task_workflow_schema_id;
          }
          log(
            `[StatusMapping] Default for ${objType.name}: ${workflowSchemaId}`,
          );
        }
        // Find statuses for this workflow schema
        const workflowSchema = this.allWorkflowSchemas.find(
          (ws: any) => ws.id === workflowSchemaId,
        );
        const statuses =
          workflowSchema?.statuses?.map((s: any) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          })) || [];
        this.statusMapping[objType.name] = {
          workflowSchemaId: workflowSchemaId || "",
          statuses,
        };
        log(`[StatusMapping] Statuses for ${objType.name}:`, statuses);
      }
      this.statusMappingReady = true;
      log("[StatusMapping] Mapping complete:", this.statusMapping);
    } catch (error) {
      log("[StatusMapping] Failed to build status mapping:", error);
      this.statusMappingReady = false;
    }
  }

  /**
   * Get applicable statuses for an entity type using the pre-fetched mapping
   */
  getApplicableStatusesForType(entityType: string): Status[] {
    if (!this.statusMappingReady) {
      log("[StatusMapping] Mapping not ready, returning empty");
      return [];
    }
    const entry = this.statusMapping[entityType];
    if (!entry) {
      log(`[StatusMapping] No mapping for entityType: ${entityType}`);
      return [];
    }
    log(
      `[StatusMapping] Returning statuses for ${entityType}:`,
      entry.statuses,
    );
    return entry.statuses;
  }

  /**
   * Fetch all ProjectSchemas, their ObjectTypes, and the statuses allowed for each ObjectType in each ProjectSchema.
   * Build a mapping: { [projectSchemaId]: { [objectTypeName]: Status[] } }
   */
  async fetchAllSchemaStatusData(): Promise<void> {
    try {
      const session = await this.getSession();
      // 1. Fetch all ProjectSchemas
      const projectSchemasResult = await session.query(
        "select id, name from ProjectSchema",
      );
      const allProjectSchemas = projectSchemasResult.data;
      log("[SchemaStatusMapping] All ProjectSchemas:", allProjectSchemas);

      // 2. Fetch all ObjectTypes
      const objectTypeResult = await session.query(
        "select id, name from ObjectType",
      );
      const allObjectTypes = objectTypeResult.data;
      log("[SchemaStatusMapping] All ObjectTypes:", allObjectTypes);

      // 3. Fetch all Statuses
      const statusResult = await session.query(
        "select id, name, color from Status",
      );
      const allStatuses = statusResult.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
      }));
      log("[SchemaStatusMapping] All Statuses:", allStatuses);

      // 4. Fetch all Schema (the link between ProjectSchema and ObjectType)
      const schemaResult = await session.query(
        "select id, project_schema_id, object_type_id from Schema",
      );
      const allSchemas = schemaResult.data;
      log("[SchemaStatusMapping] All Schema:", allSchemas);

      // 5. Fetch all SchemaStatus (the link between Schema and Status)
      const schemaStatusResult = await session.query(
        "select schema_id, status_id from SchemaStatus",
      );
      const allSchemaStatuses = schemaStatusResult.data;
      log("[SchemaStatusMapping] All SchemaStatus:", allSchemaStatuses);

      // Build mapping
      this.schemaStatusMapping = {};
      for (const projectSchema of allProjectSchemas) {
        const schemaId = projectSchema.id;
        this.schemaStatusMapping[schemaId] = {};
        // Find all Schema rows for this ProjectSchema
        const schemasForProject = allSchemas.filter(
          (sc: any) => sc.project_schema_id === schemaId,
        );
        for (const schema of schemasForProject) {
          const objectType = allObjectTypes.find(
            (ot: any) => ot.id === schema.object_type_id,
          );
          if (!objectType) continue;
          // Find all SchemaStatus rows for this Schema
          const schemaStatuses = allSchemaStatuses.filter(
            (ss: any) => ss.schema_id === schema.id,
          );
          // Map to Status objects
          const statuses = schemaStatuses
            .map((ss: any) => allStatuses.find((st) => st.id === ss.status_id))
            .filter(Boolean) as Status[];
          this.schemaStatusMapping[schemaId][objectType.name] = statuses;
          log(
            `[SchemaStatusMapping] ProjectSchema ${schemaId} (${projectSchema.name}), ObjectType ${objectType.name}:`,
            statuses,
          );
        }
      }
      this.schemaStatusMappingReady = true;
      log("[SchemaStatusMapping] Mapping complete:", this.schemaStatusMapping);
    } catch (error) {
      log(
        "[SchemaStatusMapping] Failed to build schema status mapping:",
        error,
      );
      this.schemaStatusMappingReady = false;
    }
  }

  /**
   * Get valid statuses for an entity (by id and type) using the schema mapping.
   * Looks up the entity's project, then its ProjectSchema, then the allowed statuses for the entity's type.
   */
  async getStatusesForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    if (!this.schemaStatusMappingReady) {
      log("[SchemaStatusMapping] Mapping not ready, returning empty");
      return [];
    }
    try {
      const session = await this.getSession();
      // 1. Get the entity's project and project_schema_id
      const entityQuery = await session.query(
        `select project.id, project.project_schema_id from ${entityType} where id is "${entityId}"`,
      );
      const entityData = entityQuery.data[0];
      if (!entityData) {
        log(
          `[SchemaStatusMapping] Entity not found: ${entityType} ${entityId}`,
        );
        return [];
      }
      const projectSchemaId = entityData.project?.project_schema_id;
      if (!projectSchemaId) {
        log(
          `[SchemaStatusMapping] No project_schema_id for entity: ${entityType} ${entityId}`,
        );
        return [];
      }
      // Special handling for AssetVersion (uses workflow schema, not Schema/SchemaStatus)
      if (entityType === "AssetVersion") {
        // Get the ProjectSchema to find asset_version_workflow_schema_id
        const schemaResult = await session.query(
          `select asset_version_workflow_schema_id from ProjectSchema where id is "${projectSchemaId}"`,
        );
        const schema = schemaResult.data[0];
        const workflowSchemaId = schema?.asset_version_workflow_schema_id;
        if (!workflowSchemaId) {
          log(
            `[SchemaStatusMapping] No asset_version_workflow_schema_id for ProjectSchema ${projectSchemaId}`,
          );
          return [];
        }
        // Find the workflow schema and its statuses
        const workflowSchema = this.allWorkflowSchemas.find(
          (ws: any) => ws.id === workflowSchemaId,
        );
        const statuses =
          workflowSchema?.statuses?.map((s: any) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          })) || [];
        log(
          `[SchemaStatusMapping] AssetVersion workflow schema ${workflowSchemaId} statuses:`,
          statuses,
        );
        return statuses;
      }
      // 2. Use mapping for all other types
      const statuses =
        this.schemaStatusMapping[projectSchemaId]?.[entityType] || [];
      log(
        `[SchemaStatusMapping] Statuses for ${entityType} (${entityId}) in ProjectSchema ${projectSchemaId}:`,
        statuses,
      );
      return statuses;
    } catch (error) {
      log("[SchemaStatusMapping] Failed to get statuses for entity:", error);
      return [];
    }
  }
}

export const ftrackService = new FtrackService();
