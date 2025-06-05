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

import type {
  FtrackSettings,
  Playlist,
  Note,
  AssetVersion,
  PlaylistCategory,
  Project,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  SyncVersionsResponse,
} from "@/types";
import { Session } from "@ftrack/api";
import { Attachment } from "@/components/NoteAttachments";
import { AttachmentService } from "./attachmentService";
import { safeConsoleError } from "@/utils/errorHandling";

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

      // First, determine if this is a review session or a list
      // Try to fetch as a review session first
      const reviewSessionQuery = `select id from ReviewSession where id is "${playlistId}"`;
      const reviewSessionResult = await this.session!.query(reviewSessionQuery);

      if (reviewSessionResult?.data?.length > 0) {
        // This is a review session, use the existing logic
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

        log("Running review session notes query:", query);
        const result = await this.session!.query(query);

        log("Raw notes response:", result);
        log("Number of notes found:", result?.data?.length || 0);

        return this.mapNotesToPlaylist(result?.data || []);
      } else {
        // This might be a list, try to fetch list object notes
        const listQuery = `select id from List where id is "${playlistId}"`;
        const listResult = await this.session!.query(listQuery);

        if (listResult?.data?.length > 0) {
          // This is a list, fetch notes from list objects
          const query = `select 
            id,
            content,
            created_at,
            updated_at,
            created_by_id,
            frame_number
          from Note 
          where parent_id in (
            select entity_id from ListObject where list_id is "${playlistId}"
          )
          order by created_at desc`;

          log("Running list notes query:", query);
          const result = await this.session!.query(query);

          log("Raw list notes response:", result);
          log("Number of list notes found:", result?.data?.length || 0);

          return this.mapNotesToPlaylist(result?.data || []);
        }
      }

      log("Playlist not found as review session or list:", playlistId);
      return [];
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

      // First, determine if this is a review session or a list
      // Try to fetch as a review session first
      const reviewSessionQuery = `select id from ReviewSession where id is "${playlistId}"`;
      const reviewSessionResult = await this.session!.query(reviewSessionQuery);

      if (reviewSessionResult?.data?.length > 0) {
        // This is a review session, use the existing logic
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

        log("Running review session versions query:", query);
        const result = await this.session!.query(query);

        log("Raw versions response:", result);
        log("Number of versions found:", result?.data?.length || 0);

        return this.mapVersionsToPlaylist(result?.data || []);
      } else {
        // This might be a list, try to fetch list object versions
        const listQuery = `select id from List where id is "${playlistId}"`;
        const listResult = await this.session!.query(listQuery);

        if (listResult?.data?.length > 0) {
          // This is a list, fetch versions from list objects
          // First get all entity IDs from the list, then query AssetVersion directly
          const listObjectQuery = `select entity_id from ListObject where list_id is "${playlistId}"`;
          log("Running list object query:", listObjectQuery);
          const listObjectResult = await this.session!.query(listObjectQuery);

          if (listObjectResult?.data?.length > 0) {
            const entityIds = listObjectResult.data.map((obj) => obj.entity_id);
            log("Found entity IDs in list:", entityIds);

            const query = `select 
              id,
              version,
              asset.name,
              thumbnail.id,
              thumbnail.name,
              thumbnail.component_locations
            from AssetVersion
            where id in (${entityIds.map((id) => `"${id}"`).join(", ")})
            order by date desc`;

            log("Running list versions query:", query);
            const result = await this.session!.query(query);

            log("Raw list versions response:", result);
            log("Number of list versions found:", result?.data?.length || 0);

            // Log the first item to see the data structure
            if (result?.data?.length > 0) {
              log("First version data structure:", result.data[0]);
            }

            // Map the versions for list objects (slightly different structure)
            const mappedVersions = (result?.data || []).map((version) => ({
              id: version.id,
              name: version.asset?.name || "Unknown Asset",
              version: version.version || 1,
              thumbnailId: version.thumbnail?.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              manuallyAdded: false,
            }));

            log("Mapped list versions:", mappedVersions);
            log("Returning mapped versions count:", mappedVersions.length);

            return mappedVersions;
          } else {
            log("No entities found in list:", playlistId);
            return [];
          }
        }
      }

      log("Playlist not found as review session or list:", playlistId);
      return [];
    } catch (error) {
      log("Failed to fetch versions:", error);
      return [];
    }
  }

  /**
   * Fetch all active projects user has access to
   */
  async getProjects(): Promise<Project[]> {
    const session = await this.ensureSession();
    
    // Try basic query without status - let's see what fields are actually available
    const query = `
      select id, name, full_name
      from Project 
      order by name asc
    `;
    
    try {
      log("Running projects query:", query);
      const response = await session.query(query);
      log("Received projects response:", response);
      
      return response.data.map((project: any) => ({
        id: project.id,
        name: project.name,
        fullName: project.full_name || project.name,
        status: 'Active' as const // Default to Active for now - TODO: fetch real status
      }));
    } catch (error) {
      log("Failed to fetch projects:", error);
      throw new Error("Failed to load projects from ftrack");
    }
  }

  async getPlaylists(projectId?: string | null): Promise<Playlist[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log("No active session for getPlaylists");
        return [];
      }
    }

    try {
      log("Fetching review sessions...");
      let query = `select 
        id,
        name,
        created_at,
        end_date,
        created_by_id,
        project_id
      from ReviewSession`;
      
      if (projectId) {
        query += ` where project_id is "${projectId}"`;
      }
      
      query += ` order by created_at desc`;

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
        type: "reviewsession" as const,
      }));
    } catch (error) {
      log("Failed to fetch playlists:", error);
      return [];
    }
  }

  /**
   * Fetch ftrack Lists with their categories
   * @returns Promise<Playlist[]> Array of lists formatted as playlists
   */
  async getLists(projectId?: string | null): Promise<Playlist[]> {
    if (!this.session) {
      const session = await this.initSession();
      if (!session) {
        log("No active session for getLists");
        return [];
      }
    }

    try {
      log("Fetching lists...");
      let query = `select 
        id,
        name,
        date,
        is_open,
        project_id,
        category_id,
        category.name
      from List 
      where is_open is true`;
      
      if (projectId) {
        query += ` and project_id is "${projectId}"`;
      }
      
      query += ` order by category.name, name`;

      log("Running list query:", query);
      const result = await this.session!.query(query);

      log("Received lists:", result);

      return (result?.data || []).map((list) => ({
        id: list.id,
        name: list.name,
        title: list.name,
        notes: [], // Notes will be loaded when list is selected
        createdAt: list.date || new Date().toISOString(),
        updatedAt: list.date || new Date().toISOString(),
        isQuickNotes: false,
        type: "list" as const,
        categoryId: list.category_id,
        categoryName: list.category?.name || "Uncategorized",
        isOpen: list.is_open,
      }));
    } catch (error) {
      log("Failed to fetch lists:", error);
      return [];
    }
  }

  /**
   * Fetch all playlist categories (both review sessions and lists)
   * @returns Promise<PlaylistCategory[]> Array of categorized playlists
   */
  async getPlaylistCategories(): Promise<PlaylistCategory[]> {
    try {
      log("Fetching all playlist categories...");

      // Fetch both review sessions and lists in parallel
      const [reviewSessions, lists] = await Promise.all([
        this.getPlaylists(),
        this.getLists(),
      ]);

      const categories: PlaylistCategory[] = [];

      // Add review sessions as a category if any exist
      if (reviewSessions.length > 0) {
        categories.push({
          id: "review-sessions",
          name: "Review Sessions",
          type: "reviewsessions",
          playlists: reviewSessions,
        });
      }

      // Group lists by category
      const listsByCategory = new Map<string, Playlist[]>();

      lists.forEach((list) => {
        const categoryKey = list.categoryId || "uncategorized";
        const categoryName = list.categoryName || "Uncategorized";

        if (!listsByCategory.has(categoryKey)) {
          listsByCategory.set(categoryKey, []);
        }
        listsByCategory.get(categoryKey)!.push(list);
      });

      // Add list categories
      for (const [categoryId, categoryLists] of listsByCategory) {
        const categoryName = categoryLists[0]?.categoryName || "Uncategorized";
        categories.push({
          id: categoryId,
          name: `${categoryName} Lists`,
          type: "lists",
          playlists: categoryLists,
        });
      }

      log("Organized playlist categories:", categories);
      return categories;
    } catch (error) {
      log("Failed to fetch playlist categories:", error);
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

      // Get the component with its location information
      const componentQuery = await session.query(
        `select id, name, component_locations.location_id from Component where id is "${componentId}"`,
      );
      const component = componentQuery.data[0];

      if (!component) {
        throw new Error(`Component not found: ${componentId}`);
      }

      // Use the session's built-in method to get component URL
      // This should handle the location resolution automatically
      const url = await session.getComponentUrl(componentId);

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
        // Use safe console error to avoid exposing credentials in logs
        safeConsoleError("Error getting API key:", error);
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
        `select id, name, file_type from Component where version_id is "${versionId}"`,
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
      await this.fetchAllSchemaStatusData();
    }

          try {
        const session = await this.ensureSession();

        // Query for the entity to get its object type and project schema
        const entityResult = await session.query(
          `select object_type_id, project.project_schema_id from ${entityType} where id is "${entityId}"`
        );

        if (!entityResult?.data?.length) {
          console.warn(`Entity ${entityType}:${entityId} not found`);
          return [];
        }

        const entity = entityResult.data[0];

        // Get object type name
        const objectType = this.allObjectTypes.find(
          (ot) => ot.id === entity.object_type_id,
        );
        const objectTypeName = objectType?.name || entityType;

        // Get project schema
        const projectSchemaId = entity.project?.project_schema_id;
      if (!projectSchemaId) {
        console.warn(`No project schema found for entity ${entityType}:${entityId}`);
        return [];
      }

      // Get statuses from mapping
      const schemaMapping = this.schemaStatusMapping[projectSchemaId];
      if (!schemaMapping) {
        console.warn(`No schema mapping found for project schema ${projectSchemaId}`);
        return [];
      }

      const statuses = schemaMapping[objectTypeName] || [];
      log(`Found ${statuses.length} statuses for ${objectTypeName} in schema ${projectSchemaId}`);

      return statuses;
    } catch (error) {
      console.error("Error fetching statuses for entity:", error);
      return [];
    }
  }

  /**
   * Creates a new Review Session in ftrack
   */
  async createReviewSession(request: CreatePlaylistRequest): Promise<CreatePlaylistResponse> {
    try {
      const session = await this.ensureSession();
      
      if (!this.currentUserId) {
        throw new Error("User ID not available");
      }

      const now = new Date();
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const response = await session.create('ReviewSession', {
        name: request.name,
        project_id: request.projectId,
        description: request.description || '',
        created_by_id: this.currentUserId,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        availability: 'internal'
      }) as any;

      return {
        id: response.id,
        name: response.name,
        type: 'reviewsession',
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create review session';
      return {
        id: '',
        name: request.name,
        type: 'reviewsession',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Creates a new List in ftrack
   */
  async createList(request: CreatePlaylistRequest): Promise<CreatePlaylistResponse> {
    try {
      const session = await this.ensureSession();
      
      if (!this.currentUserId) {
        throw new Error("User ID not available");
      }

      if (!request.categoryId) {
        throw new Error("Category ID is required for list creation");
      }

      const response = await session.create('AssetVersionList', {
        name: request.name,
        project_id: request.projectId,
        category_id: request.categoryId,
        user_id: this.currentUserId,
        is_open: true
      }) as any;

      return {
        id: response.id,
        name: response.name,
        type: 'list',
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create list';
      return {
        id: '',
        name: request.name,
        type: 'list',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Gets available list categories for a project
   */
  async getListCategories(projectId: string): Promise<PlaylistCategory[]> {
    try {
      const session = await this.ensureSession();

      const result = await session.query(
        `select id, name from ListCategory`
      );

      if (!result?.data) {
        return [];
      }

      return result.data.map((category: any) => ({
        id: category.id,
        name: category.name,
        type: 'lists' as const,
        playlists: []
      }));

    } catch (error) {
      console.error("Failed to fetch list categories:", error);
      return [];
    }
  }

  /**
   * Adds asset versions to an existing ftrack playlist
   */
  async addVersionsToPlaylist(
    playlistId: string, 
    versionIds: string[], 
    playlistType: 'reviewsession' | 'list'
  ): Promise<SyncVersionsResponse> {
    try {
      const session = await this.ensureSession();
      const syncedVersionIds: string[] = [];
      const failedVersionIds: string[] = [];

      for (let i = 0; i < versionIds.length; i++) {
        const versionId = versionIds[i];
        
        try {
          if (playlistType === 'reviewsession') {
            // Create ReviewSessionObject
            await session.create('ReviewSessionObject', {
              review_session_id: playlistId,
              version_id: versionId,
              name: `Version ${i + 1}`,
              description: '',
              sort_order: i
            });
          } else {
            // Create ListObject
            await session.create('ListObject', {
              list_id: playlistId,
              entity_id: versionId
            });
          }
          
          syncedVersionIds.push(versionId);
        } catch (error) {
          console.error(`Failed to add version ${versionId} to playlist:`, error);
          failedVersionIds.push(versionId);
        }
      }

      return {
        playlistId,
        syncedVersionIds,
        failedVersionIds,
        success: failedVersionIds.length === 0,
        error: failedVersionIds.length > 0 ? `Failed to sync ${failedVersionIds.length} versions` : undefined
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync versions';
      return {
        playlistId,
        syncedVersionIds: [],
        failedVersionIds: versionIds,
        success: false,
        error: errorMessage
      };
    }
  }
}

export const ftrackService = new FtrackService();
