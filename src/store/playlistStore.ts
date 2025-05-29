/**
 * @fileoverview playlistStore.ts
 * Individual playlist state and cache management.
 * Handles:
 * - Version tracking and updates
 * - Draft content persistence
 * - Playlist synchronization
 * - Change detection and polling
 * - Attachment management
 */

import { db, NoteAttachment } from "./db";
import { Playlist, AssetVersion, NoteStatus } from "@/types";
import { FtrackService } from "../services/ftrack";
import { Attachment } from "@/components/NoteAttachments";

const DEBUG = true;
function log(...args: any[]): void {
  if (DEBUG) {
    console.log(...args);
  }
}

interface VersionModifications {
  addedVersions: string[];
  removedVersions: string[];
}

interface FtrackVersion {
  id: string;
  name: string;
  version: number;
  thumbnail_url?: URL;
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface StorableVersion extends AssetVersion {
  id: string;
  playlistId: string;
  lastModified: number;
  draftContent?: string;
  labelId: string;
  name: string;
  version: number;
  thumbnailUrl?: string;
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  createdAt: string;
  updatedAt: string;
  manuallyAdded?: boolean;
  noteStatus?: NoteStatus;
  attachments?: NoteAttachment[];
}

interface CachedVersion extends StorableVersion {
  isRemoved?: boolean;
  lastChecked?: number;
}

export type { CachedVersion };

interface CachedPlaylist extends Playlist {
  lastAccessed: number;
  lastChecked: number;
  hasModifications: boolean;
  addedVersions: string[];
  removedVersions: string[];
}

export class PlaylistStore {
  private static POLL_INTERVAL = 5000; // 5 seconds
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private currentPlaylistId: string | null = null;
  private activePollingIds: Set<string> = new Set();
  private ftrackService: FtrackService;
  private pollingCallback:
    | ((
        added: number,
        removed: number,
        addedVersions?: string[],
        removedVersions?: string[],
        freshVersions?: FtrackVersion[],
      ) => void)
    | null = null;
  private versionAddInProgress: boolean = false;
  private recentlyManuallyRemovedIds: Map<string, Set<string>> = new Map();
  private recentlyProcessedChanges: Map<
    string,
    { addedIds: Set<string>; removedIds: Set<string>; timestamp: number }
  > = new Map();

  constructor(ftrackService: FtrackService) {
    this.ftrackService = ftrackService;

    // Set up periodic cleanup for recently processed changes to prevent memory leaks
    setInterval(() => {
      this.cleanupExpiredProcessedChanges();
    }, 30000); // Clean up every 30 seconds
  }

  private findNonSerializableProps(obj: any, path = ""): string[] {
    const nonSerializable: string[] = [];

    if (!obj || typeof obj !== "object") return nonSerializable;

    for (const key in obj) {
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === "function") {
        nonSerializable.push(
          `Function at ${currentPath}: ${value.toString().slice(0, 100)}...`,
        );
      } else if (typeof value === "object" && value !== null) {
        if (value instanceof Date) continue; // Dates are fine
        if (Array.isArray(value)) {
          // Check array items
          value.forEach((item, index) => {
            if (typeof item === "object" && item !== null) {
              nonSerializable.push(
                ...this.findNonSerializableProps(
                  item,
                  `${currentPath}[${index}]`,
                ),
              );
            } else if (typeof item === "function") {
              nonSerializable.push(
                `Function in array at ${currentPath}[${index}]: ${item.toString().slice(0, 100)}...`,
              );
            }
          });
        } else {
          nonSerializable.push(
            ...this.findNonSerializableProps(value, currentPath),
          );
        }
      }
    }

    return nonSerializable;
  }

  private cleanDate(date: string | Date | undefined): string {
    if (!date) return new Date().toISOString();
    return typeof date === "string" ? date : date.toISOString();
  }

  public cleanPlaylistForStorage(playlist: Playlist): CachedPlaylist {
    // Create a new object with only serializable properties
    const cleanPlaylist: CachedPlaylist = {
      id: playlist.id,
      name: playlist.name,
      title: playlist.title,
      createdAt: this.cleanDate(playlist.createdAt),
      updatedAt: this.cleanDate(playlist.updatedAt),
      isQuickNotes: playlist.isQuickNotes,
      versions: playlist.versions?.map((v) => ({
        id: v.id,
        name: v.name,
        version: v.version,
        reviewSessionObjectId: v.reviewSessionObjectId || "",
        thumbnailUrl: v.thumbnailUrl || "",
        thumbnailId: v.thumbnailId || "",
        createdAt: this.cleanDate(v.createdAt),
        updatedAt: this.cleanDate(v.updatedAt),
        manuallyAdded: v.manuallyAdded || false, // Preserve manuallyAdded flag
        noteStatus: (v as any).noteStatus || undefined, // Preserve noteStatus if it exists
      })),
      notes: (playlist.notes || []).map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: this.cleanDate(n.createdAt),
        updatedAt: this.cleanDate(n.updatedAt),
        createdById: n.createdById || "",
        author: n.author || "",
      })),
      lastAccessed: Date.now(),
      lastChecked: Date.now(),
      hasModifications: false,
      addedVersions: [],
      removedVersions: [],
    };

    return cleanPlaylist;
  }

  private cleanVersion(
    version: FtrackVersion,
    playlistId: string,
  ): StorableVersion {
    return {
      id: version.id,
      playlistId,
      name: version.name || "",
      version: version.version,
      thumbnailUrl: version.thumbnailUrl || "",
      thumbnailId: version.thumbnailId || "",
      reviewSessionObjectId: version.reviewSessionObjectId || "",
      createdAt: this.cleanDate(version.createdAt),
      updatedAt: this.cleanDate(version.updatedAt),
      lastModified: Date.now(),
      draftContent: "", // Initialize with empty draft
      labelId: "", // Initialize with empty label
    };
  }

  /**
   * Creates a serializable version of an object by only including primitive values
   * and explicitly defined properties. This prevents DataCloneError when storing in IndexedDB.
   */
  private createSerializableObject<T>(obj: any, template: T): T {
    // Create a new object with only the properties from the template
    const result = {} as T;

    // Only copy primitive values or explicitly defined properties
    for (const key in template) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        // Handle different types of values
        if (value === null || value === undefined) {
          // Use undefined for null/undefined values (IndexedDB handles undefined better)
          (result as any)[key] = undefined;
        } else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          // Primitive values can be directly assigned
          (result as any)[key] = value;
        } else if (typeof value === "object") {
          // For objects (including Date), convert to string if possible
          try {
            if (value instanceof Date) {
              (result as any)[key] = value.toISOString();
            } else {
              // For other objects, try JSON serialization as a test
              JSON.stringify(value);
              (result as any)[key] = value;
            }
          } catch (e) {
            // If serialization fails, use undefined
            console.warn(`Could not serialize property ${key}`, e);
            (result as any)[key] = undefined;
          }
        } else {
          // For other types (functions, symbols), use undefined
          (result as any)[key] = undefined;
        }
      } else if (Object.prototype.hasOwnProperty.call(template, key)) {
        // If the key exists in template but not in obj, use the template value
        (result as any)[key] = (template as any)[key];
      }
    }

    return result;
  }

  async getDraftContent(
    playlistId: string,
    versionId: string,
  ): Promise<string> {
    try {
      const version = await db.versions.get([playlistId, versionId]);
      return version?.draftContent || "";
    } catch (error) {
      console.error("Failed to get draft content:", error);
      return "";
    }
  }

  async getPlaylist(id: string): Promise<CachedPlaylist | null> {
    try {
      console.log(`[PlaylistStore] Getting playlist ${id}`);

      // Get the playlist metadata from cache first
      const cached = await db.playlists.get(id);
      if (!cached) {
        console.log(`[PlaylistStore] No playlist found with id ${id}`);
        return null;
      }

      // Get versions separately from versions table - our source of truth for versions
      const dbVersions = await db.versions
        .where("playlistId")
        .equals(id)
        .filter((v) => !v.isRemoved)
        .toArray();

      console.log(
        `[PlaylistStore] Found ${dbVersions.length} versions for playlist ${id}`,
      );

      // If no versions in cache but playlist has versions, initialize from cached playlist
      if (
        dbVersions.length === 0 &&
        cached?.versions &&
        cached.versions.length > 0
      ) {
        console.log(
          `[PlaylistStore] No DB versions, but ${cached.versions.length} cached versions. Initializing...`,
        );
        await this.initializePlaylist(id, cached);
        // Try getting versions again after initialization
        return this.getPlaylist(id);
      }

      // Create a defensive copy of the playlist
      const result: CachedPlaylist = {
        ...cached,
        versions: [], // We'll populate this from DB versions
      };

      // Sort versions by name and version number
      const sortedVersions = [...dbVersions].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return (b.version || 0) - (a.version || 0);
      });

      // Fetch attachments separately (safer than storing them on version objects)
      const attachments = await db.attachments
        .where("playlistId")
        .equals(id)
        .toArray();

      console.log(
        `[PlaylistStore] Loaded ${attachments.length} attachments for playlist ${id}`,
      );

      // Create a map of version IDs to attachments for efficient lookup
      const attachmentMap = new Map();
      attachments.forEach((att) => {
        if (!attachmentMap.has(att.versionId)) {
          attachmentMap.set(att.versionId, []);
        }
        // Create a safe copy without binary data
        const { data, ...safeAttachment } = att;
        attachmentMap.get(att.versionId).push(safeAttachment);
      });

      // Add versions with their attachments to the result
      result.versions = sortedVersions.map((version) => {
        const versionAttachments = attachmentMap.get(version.id) || [];

        // Create a clean copy without complex structures to avoid serialization issues
        return {
          id: version.id,
          name: version.name,
          version: version.version,
          thumbnailUrl: version.thumbnailUrl,
          thumbnailId: version.thumbnailId,
          reviewSessionObjectId: version.reviewSessionObjectId,
          createdAt: version.createdAt,
          updatedAt: version.updatedAt,
          manuallyAdded: version.manuallyAdded || false,
          noteStatus: version.noteStatus || "empty",
          // Extra fields needed for the app
          draftContent: version.draftContent || "",
          labelId: version.labelId || "",
          // Store attachments as a separate array for reference
          attachments: versionAttachments,
        };
      });

      return result;
    } catch (error) {
      console.error("[PlaylistStore] Failed to get playlist:", error);
      return null;
    }
  }

  async saveDraft(
    versionId: string,
    playlistId: string,
    content: string,
    labelId: string = "",
  ): Promise<void> {
    try {
      log(`[PlaylistStore] Saving draft for version ${versionId}`);

      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify({
          draftContent: content,
          labelId,
          lastModified: Date.now(),
        });
    } catch (error) {
      console.error("Failed to save draft:", error);
      throw error;
    }
  }

  async saveAttachments(
    versionId: string,
    playlistId: string,
    attachments: Attachment[],
  ): Promise<void> {
    try {
      log(
        `[PlaylistStore] Saving ${attachments.length} attachments for version ${versionId}`,
      );

      // First check if we should preserve existing attachments by checking if any have been deleted
      const existingAttachments = await db.attachments
        .where("[versionId+playlistId]")
        .equals([versionId, playlistId])
        .toArray();

      if (existingAttachments.length > 0) {
        log(
          `[PlaylistStore] Found ${existingAttachments.length} existing attachments for version ${versionId}`,
        );

        // If the count is the same, we may just be refreshing the state, so keep Blob data
        if (existingAttachments.length === attachments.length) {
          const existingIds = new Set(existingAttachments.map((att) => att.id));
          const newIds = new Set(attachments.map((att) => att.id));

          // Check if the sets of IDs are the same
          const sameIds =
            existingIds.size === newIds.size &&
            [...existingIds].every((id) => newIds.has(id));

          if (sameIds) {
            log(
              "[PlaylistStore] Attachment sets are identical - preserving existing data",
            );
            // Update the version record with the existing attachments to maintain consistency
            await db.versions
              .where("[playlistId+id]")
              .equals([playlistId, versionId])
              .modify((version) => {
                version.attachments = existingAttachments;
                version.lastModified = Date.now();
              });
            return;
          }
        }
      }

      // If we get here, we need to save the new attachments
      // First, delete any existing attachments for this version+playlist
      await db.attachments
        .where("[versionId+playlistId]")
        .equals([versionId, playlistId])
        .delete();

      // If there are no attachments to save, we're done
      if (attachments.length === 0) {
        return;
      }

      // Convert Attachment objects to NoteAttachment for storage
      const noteAttachments: NoteAttachment[] = [];
      const isTauri =
        typeof window !== "undefined" &&
        "window" in globalThis &&
        window.__TAURI__ !== undefined;

      // Process each attachment individually
      for (const attachment of attachments) {
        if (!attachment.file) {
          log(
            `[PlaylistStore] Skipping attachment ${attachment.name} with no file`,
          );
          continue;
        }

        try {
          // Handle both string paths and File objects
          let fileSize = 0;
          let fileData: Blob | undefined = undefined;
          let filePath: string | undefined = undefined;

          if (attachment.file instanceof File) {
            // It's a browser File object
            fileSize = attachment.file.size;

            // For large files, don't store the binary data directly to avoid indexedDB errors
            if (fileSize > 5 * 1024 * 1024) {
              // 5MB limit
              log(
                `[PlaylistStore] File ${attachment.name} exceeds 5MB, storing reference only`,
              );
              // Don't set fileData, just store metadata
            } else {
              fileData = attachment.file;
            }

            log(
              `[PlaylistStore] Processing browser File: ${attachment.name}, size: ${fileSize} bytes`,
            );
          } else {
            // It's a file path string (Tauri)
            filePath = attachment.file;

            // Try to get file size if we're in Tauri environment
            if (isTauri) {
              try {
                // Dynamically import the fs module
                const fs = await import("@tauri-apps/plugin-fs");
                // Get metadata to determine file size
                const fileMetadata = await fs.stat(filePath);
                fileSize = fileMetadata.size || 0;
                log(
                  `[PlaylistStore] Got Tauri file metadata for ${attachment.name}, size: ${fileSize} bytes`,
                );
              } catch (fsError) {
                // If we can't get the size, just log and continue
                console.error(
                  `[PlaylistStore] Could not get file size for ${filePath}:`,
                  fsError,
                );
                fileSize = 0;
              }
            }

            log(
              `[PlaylistStore] Processing Tauri file path: ${filePath}, size: ${fileSize} bytes`,
            );
          }

          noteAttachments.push({
            id: attachment.id,
            noteId: "", // Will be filled when published
            versionId,
            playlistId,
            name: attachment.name,
            type: attachment.type,
            size: fileSize,
            data: fileData, // Only store actual Blob objects here for small files
            previewUrl: attachment.previewUrl,
            createdAt: Date.now(),
            filePath, // Add custom field for Tauri paths
          } as NoteAttachment); // Use type assertion since filePath is custom
        } catch (attachError) {
          console.error(
            `[PlaylistStore] Error processing attachment ${attachment.name}:`,
            attachError,
          );
        }
      }

      // Save attachments to the database one by one to avoid bulk errors
      if (noteAttachments.length > 0) {
        log(
          `[PlaylistStore] Saving ${noteAttachments.length} processed attachments to database`,
        );

        let saveCount = 0;
        let errorCount = 0;

        // Save each attachment individually to isolate errors
        for (const att of noteAttachments) {
          try {
            await db.attachments.put(att);
            saveCount++;
          } catch (err) {
            errorCount++;

            // Check specifically for DataCloneError which indicates serialization problems
            const isSerializationError =
              typeof err === "object" &&
              err !== null &&
              ((err as Error).name === "DataCloneError" ||
                String(err).includes("could not be cloned") ||
                String(err).includes("could not be serialized"));

            console.error(
              `[PlaylistStore] Failed to save attachment ${att.id}: ${isSerializationError ? "SERIALIZATION ERROR" : "GENERAL ERROR"}`,
              err,
            );

            // Try again with a safe version without the binary data
            try {
              const { data, ...safeAttachment } = att;
              await db.attachments.put({
                ...safeAttachment,
                size: att.size || 0, // Preserve size information
                dataRemoved: true, // Flag to indicate data was removed
                errorMessage: String(err), // Store the error message for debugging
              } as NoteAttachment);

              log(
                `[PlaylistStore] Successfully saved attachment ${att.id} without binary data`,
              );
              saveCount++;
              errorCount--; // Decrement error count since we recovered
            } catch (retryErr) {
              console.error(
                `[PlaylistStore] Failed to save attachment ${att.id} without binary data:`,
                retryErr,
              );
            }
          }
        }

        log(
          `[PlaylistStore] Saved ${saveCount}/${noteAttachments.length} attachments with ${errorCount} errors`,
        );
      } else {
        log(`[PlaylistStore] No attachments to save after processing`);
      }

      // Make safe copies of attachments for version record (without binary data)
      const safeAttachments = noteAttachments.map((att) => {
        const { data, ...safeAtt } = att;
        return safeAtt;
      });

      // Update the version with the attachment IDs
      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify((version) => {
          version.attachments = safeAttachments;
          version.lastModified = Date.now();
        });

      log(
        `[PlaylistStore] Successfully saved attachments for version ${versionId}`,
      );
    } catch (error) {
      console.error("[PlaylistStore] Failed to save attachments:", error);
      // Don't throw the error - this allows the UI to continue functioning
      // even if some attachments fail to save
    }
  }

  async clearAttachments(versionId: string, playlistId: string): Promise<void> {
    try {
      log(`[PlaylistStore] Clearing attachments for version ${versionId}`);

      // Delete all attachments for this version from the attachments table
      await db.attachments
        .where("[versionId+playlistId]")
        .equals([versionId, playlistId])
        .delete();

      // Update the version to remove the attachments
      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify((version) => {
          version.attachments = [];
          version.lastModified = Date.now();
        });
    } catch (error) {
      console.error("Failed to clear attachments:", error);
      throw error;
    }
  }

  async saveNoteStatus(
    versionId: string,
    playlistId: string,
    status: NoteStatus,
    content?: string,
    hasAttachments: boolean = false,
  ): Promise<void> {
    try {
      // If content is empty but has attachments, still set as draft
      let actualStatus = status;
      if (status === "empty" && hasAttachments) {
        actualStatus = "draft";
      }

      const modification: any = {
        noteStatus: actualStatus,
        lastModified: Date.now(),
      };

      // If content is provided, update it as well
      if (content !== undefined) {
        modification.draftContent = content;
      }

      log(
        `[PlaylistStore] Saving note status for version ${versionId}: ${actualStatus} (has attachments: ${hasAttachments})`,
      );

      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify(modification);
    } catch (error) {
      console.error("Failed to save note status:", error);
      throw error;
    }
  }

  async cachePlaylist(playlist: CachedPlaylist): Promise<void> {
    try {
      console.log(
        `[PlaylistStore] Caching playlist ${playlist.id} with ${playlist.versions?.length || 0} versions`,
      );

      // Get current versions to preserve draft content
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlist.id)
        .toArray();

      // Create maps for quick lookup of existing data
      const draftMap = new Map(
        existingVersions.map((v) => [v.id, v.draftContent || ""]),
      );
      const labelIdMap = new Map(
        existingVersions.map((v) => [v.id, v.labelId || ""]),
      );
      const noteStatusMap = new Map(
        existingVersions.map((v) => [v.id, v.noteStatus || "empty"]),
      );
      const manualAddedMap = new Map(
        existingVersions.map((v) => [v.id, v.manuallyAdded || false]),
      );

      // First, store a clean copy of the playlist without versions to avoid serialization issues
      const playlistWithoutVersions = {
        ...playlist,
        versions: [], // temporarily remove versions to store the playlist separately
      };

      // Cache the playlist metadata first
      await db.playlists.put(playlistWithoutVersions);

      // Then save versions individually to avoid potential serialization issues
      if (playlist.versions && playlist.versions.length > 0) {
        console.log(
          `[PlaylistStore] Saving ${playlist.versions.length} versions for playlist ${playlist.id}`,
        );

        // Process versions one by one to isolate any serialization issues
        for (const version of playlist.versions) {
          try {
            const versionId = version.id;

            // Create a clean, primitive-only version of the version object
            const cleanVersion = {
              id: versionId,
              playlistId: playlist.id,
              name: version.name || "",
              version: version.version || 0,
              thumbnailUrl: version.thumbnailUrl || "",
              thumbnailId: version.thumbnailId || "",
              reviewSessionObjectId: version.reviewSessionObjectId || "",
              createdAt: this.cleanDate(version.createdAt),
              updatedAt: this.cleanDate(version.updatedAt),
              lastModified: Date.now(),

              // Preserve existing values for state fields
              draftContent:
                draftMap.get(versionId) || (version as any).draftContent || "",
              labelId:
                labelIdMap.get(versionId) || (version as any).labelId || "",
              noteStatus:
                noteStatusMap.get(versionId) === "published"
                  ? "published" // Always preserve published status
                  : noteStatusMap.get(versionId) ||
                    (version as any).noteStatus ||
                    "empty",
              manuallyAdded:
                manualAddedMap.get(versionId) || version.manuallyAdded || false,
              isRemoved: false,
            };

            // Save the clean version to IndexedDB
            await db.versions.put(cleanVersion, [playlist.id, versionId]);
          } catch (versionError) {
            console.error(
              `[PlaylistStore] Error saving version ${version.id}:`,
              versionError,
            );
            // Continue with other versions even if one fails
          }
        }
      }
    } catch (err) {
      console.error("[PlaylistStore] Error in cachePlaylist:", err);
      throw err;
    }
  }

  async initializePlaylist(
    playlistId: string,
    playlist: Playlist,
  ): Promise<void> {
    try {
      const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);

      // Special handling for Quick Notes
      if (playlistId === "quick-notes") {
        const existingVersions = await db.versions
          .where("playlistId")
          .equals(playlistId)
          .toArray();

        // Only cache new versions, preserve existing ones
        if (existingVersions.length > 0) {
          const existingIds = new Set(existingVersions.map((v) => v.id));
          cleanedPlaylist.versions =
            playlist.versions?.filter((v) => !existingIds.has(v.id)) || [];
        }
      }

      await this.cachePlaylist(cleanedPlaylist);
    } catch (error) {
      console.error("Error initializing playlist:", error);
      throw error;
    }
  }

  async initializeQuickNotes(): Promise<void> {
    const quickNotes = await this.getPlaylist("quick-notes");
    if (!quickNotes) {
      const cleanedPlaylist = this.cleanPlaylistForStorage({
        id: "quick-notes",
        name: "Quick Notes",
        title: "Quick Notes",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isQuickNotes: true,
        versions: [],
        notes: [],
      });
      await this.cachePlaylist(cleanedPlaylist);
    }
  }

  async updatePlaylist(playlistId: string): Promise<void> {
    // Don't update Quick Notes from Ftrack
    if (playlistId === "quick-notes") return;

    try {
      // 1. Get all versions from IndexedDB (our source of truth)
      const dbVersions = await db.versions
        .where("playlistId")
        .equals(playlistId)
        .filter((v) => !v.isRemoved)
        .toArray();

      // Create a map for quick lookup of DB versions
      const dbVersionsMap = new Map(dbVersions.map((v) => [v.id, v]));

      // 2. Get fresh data from Ftrack
      const freshVersions =
        await this.ftrackService.getPlaylistVersions(playlistId);
      console.log("🔍 Fresh versions from Ftrack:", {
        count: freshVersions.length,
        versions: freshVersions.map((v) => ({ id: v.id, name: v.name })),
      });

      // Create a map for quick lookup of fresh versions
      const freshVersionsMap = new Map(freshVersions.map((v) => [v.id, v]));

      // 3. Find manually added versions from IndexedDB
      const manualVersions = dbVersions.filter((v) => v.manuallyAdded);
      console.log("🤚 Manual versions to preserve:", {
        count: manualVersions.length,
        versions: manualVersions.map((v) => ({
          id: v.id,
          name: v.name,
          manuallyAdded: v.manuallyAdded,
        })),
      });

      // 4. Merge versions:
      // - Start with all versions from IndexedDB
      // - Update their data if they exist in fresh versions
      // - Add any new versions from fresh data
      const versionsToProcess = dbVersions.map((dbVersion) => {
        const freshVersion = freshVersionsMap.get(dbVersion.id);
        // If it exists in fresh data, update its metadata
        if (freshVersion) {
          return {
            ...freshVersion,
            playlistId,
            draftContent: dbVersion.draftContent || "",
            labelId: dbVersion.labelId || "",
            lastModified: Date.now(),
            manuallyAdded: dbVersion.manuallyAdded || false,
            noteStatus: dbVersion.noteStatus,
            isRemoved: dbVersion.isRemoved || false,
          };
        }
        // If it doesn't exist in fresh data but is manually added, keep it
        if (dbVersion.manuallyAdded) {
          return {
            ...dbVersion,
            lastModified: Date.now(),
            isRemoved: false,
          };
        }
        // Otherwise mark it as removed
        return {
          ...dbVersion,
          isRemoved: true,
        };
      });

      // Separate removed versions for deletion
      const removedVersions = versionsToProcess.filter((v) => v.isRemoved);
      const keptVersions = versionsToProcess.filter((v) => !v.isRemoved);

      // Actually delete removed versions from IndexedDB
      if (removedVersions.length > 0) {
        console.log(
          `🗑️ Deleting ${removedVersions.length} removed versions from IndexedDB:`,
          {
            removedIds: removedVersions.map((v) => v.id),
          },
        );

        for (const removedVersion of removedVersions) {
          try {
            await db.versions.delete([playlistId, removedVersion.id]);
            // Also delete any attachments for this version
            await db.attachments
              .where("[versionId+playlistId]")
              .equals([removedVersion.id, playlistId])
              .delete();
          } catch (deleteError) {
            console.error(
              `Failed to delete version ${removedVersion.id}:`,
              deleteError,
            );
          }
        }
      }

      const mergedVersions = [
        // Keep existing versions that weren't removed
        ...keptVersions,

        // Then add any new versions from fresh data
        ...freshVersions
          .filter((v) => !dbVersionsMap.has(v.id))
          .map((v) => ({
            ...v,
            playlistId,
            draftContent: "",
            labelId: "",
            lastModified: Date.now(),
            manuallyAdded: false,
            isRemoved: false,
            noteStatus: "empty",
          })),
      ];

      console.log("✅ Merged versions result:", {
        freshCount: freshVersions.length,
        manualCount: manualVersions.length,
        finalCount: mergedVersions.length,
        preservedManualCount: mergedVersions.filter((v) => v.manuallyAdded)
          .length,
      });

      // Track which changes we're processing to prevent immediate re-detection
      const currentVersionIds = new Set(dbVersions.map((v) => v.id));
      const freshVersionIds = new Set(freshVersions.map((v) => v.id));

      const addedIds = new Set(
        freshVersions
          .filter((v) => !currentVersionIds.has(v.id))
          .map((v) => v.id),
      );
      const removedIds = new Set(
        dbVersions
          .filter((v) => !v.manuallyAdded && !freshVersionIds.has(v.id))
          .map((v) => v.id),
      );

      if (addedIds.size > 0 || removedIds.size > 0) {
        this.recentlyProcessedChanges.set(playlistId, {
          addedIds,
          removedIds,
          timestamp: Date.now(),
        });

        console.log("📝 Recording processed changes:", {
          playlistId,
          addedCount: addedIds.size,
          removedCount: removedIds.size,
          addedIds: Array.from(addedIds),
          removedIds: Array.from(removedIds),
        });
      }

      // 5. Get fresh playlist data and merge with versions
      const fresh = await this.ftrackService.getPlaylists();
      const freshPlaylist = fresh.find((p) => p.id === playlistId);

      if (!freshPlaylist) {
        console.log("No playlist found with id:", playlistId);
        return;
      }

      const playlistWithVersions = {
        ...freshPlaylist,
        versions: mergedVersions,
      };

      // 6. Update the local cache
      await this.cachePlaylist(
        this.cleanPlaylistForStorage(playlistWithVersions),
      );
    } catch (error) {
      console.error("Failed to update playlist:", error);
    }
  }

  async updatePlaylistAndRestartPolling(
    playlistId: string,
    onModificationsFound: (
      added: number,
      removed: number,
      addedVersions?: string[],
      removedVersions?: string[],
      freshVersions?: FtrackVersion[],
    ) => void,
  ): Promise<void> {
    // Update the playlist first
    await this.updatePlaylist(playlistId);

    // Add a delay to ensure IndexedDB operations have completed
    // and any cached data is properly invalidated
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Only restart polling if it was already running
    if (this.pollingInterval) {
      await this.startPolling(playlistId, onModificationsFound);
    }
  }

  async startPolling(
    playlistId: string,
    onModificationsFound: (
      added: number,
      removed: number,
      addedVersions?: string[],
      removedVersions?: string[],
      freshVersions?: FtrackVersion[],
    ) => void,
  ): Promise<void> {
    console.log("🔄 Starting polling for playlist:", playlistId);

    // If we're already polling this playlist, don't start another polling instance
    if (this.activePollingIds.has(playlistId)) {
      console.log(
        `Already polling for playlist ${playlistId}, skipping duplicate poll`,
      );
      return;
    }

    // If we're polling a different playlist, stop that polling first
    if (this.currentPlaylistId !== playlistId) {
      this.stopPolling();
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.currentPlaylistId = playlistId;
    this.activePollingIds.add(playlistId);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const poll = async () => {
      if (this.isPolling || this.currentPlaylistId !== playlistId) {
        return;
      }

      this.isPolling = true;

      try {
        console.log("🔄 Polling for changes on playlist:", playlistId);
        const cached = await this.getPlaylist(playlistId);
        if (!cached) {
          console.log("❌ No cached playlist found:", playlistId);
          return;
        }

        // Get fresh versions
        const freshVersions =
          await this.ftrackService.getPlaylistVersions(playlistId);
        console.log("🔍 Fresh versions:", {
          count: freshVersions.length,
          versions: freshVersions.map((v) => ({ id: v.id, name: v.name })),
        });

        // Get all cached versions
        const cachedVersions = (cached.versions || []) as StorableVersion[];
        console.log("💾 Cached versions:", {
          count: cachedVersions.length,
          versions: cachedVersions.map((v) => ({
            id: v.id,
            name: v.name,
            manuallyAdded: v.manuallyAdded,
          })),
        });

        // Create lookup maps for faster comparison
        const freshMap = new Map(
          freshVersions.map((v) => [`${playlistId}:${v.id}`, v]),
        );
        const cachedMap = new Map(
          cachedVersions.map((v) => [`${playlistId}:${v.id}`, v]),
        );

        // Find manually added versions - we'll preserve these
        const manualVersions = cachedVersions.filter((v) => v.manuallyAdded);
        console.log("🤚 Manual versions to preserve:", {
          count: manualVersions.length,
          versions: manualVersions.map((v) => ({
            id: v.id,
            name: v.name,
            manuallyAdded: v.manuallyAdded,
          })),
        });

        // Create a set of manual version IDs for quick lookup
        const manualVersionIds = new Set(manualVersions.map((v) => v.id));

        // Get the set of recently manually removed IDs for this playlist
        const recentlyRemovedIds =
          this.recentlyManuallyRemovedIds.get(playlistId) || new Set();

        // Get recently processed changes (from automatic updates)
        const recentlyProcessed = this.recentlyProcessedChanges.get(playlistId);
        const recentlyProcessedAddedIds =
          recentlyProcessed?.addedIds || new Set();
        const recentlyProcessedRemovedIds =
          recentlyProcessed?.removedIds || new Set();

        // Find added versions (in fresh but not in cached)
        const addedVersions = freshVersions
          .filter((v) => {
            const key = `${playlistId}:${v.id}`;
            const notInCached = !cachedMap.has(key);
            const notRecentlyProcessed = !recentlyProcessedAddedIds.has(v.id);

            if (notInCached && !notRecentlyProcessed) {
              console.log("⏭️ Skipping recently processed added version:", {
                id: v.id,
                name: v.name,
              });
              return false;
            }

            if (notInCached) {
              console.log("➕ Potential added version:", {
                id: v.id,
                name: v.name,
                notInCached,
              });
            }
            return notInCached && notRecentlyProcessed;
          })
          .map((v) => v.id);

        // Find removed versions (in cached but not in fresh)
        // Exclude manually added versions AND recently manually removed versions AND recently processed changes
        const removedVersions = cachedVersions
          .filter((v) => {
            const key = `${playlistId}:${v.id}`;
            const notInFresh = !freshMap.has(key);

            // Skip if manually added OR recently manually removed OR recently processed
            if (
              manualVersionIds.has(v.id) ||
              recentlyRemovedIds.has(v.id) ||
              recentlyProcessedRemovedIds.has(v.id)
            ) {
              if (recentlyProcessedRemovedIds.has(v.id)) {
                console.log("⏭️ Skipping recently processed removed version:", {
                  id: v.id,
                  name: v.name,
                });
              }
              return false;
            }

            if (notInFresh) {
              console.log("➖ Potential removed version:", {
                id: v.id,
                name: v.name,
                notInFresh,
                isManual: v.manuallyAdded,
              });
              return true;
            }
            return false;
          })
          .map((v) => v.id);

        console.log("✅ Version comparison complete:", {
          added: addedVersions.length,
          removed: removedVersions.length,
          addedIds: addedVersions,
          removedIds: removedVersions,
          preservedManualIds: Array.from(manualVersionIds),
          recentlyRemovedIds: Array.from(recentlyRemovedIds),
          recentlyProcessedAddedIds: Array.from(recentlyProcessedAddedIds),
          recentlyProcessedRemovedIds: Array.from(recentlyProcessedRemovedIds),
        });

        // Only notify if there are actual changes
        if (
          (addedVersions.length > 0 || removedVersions.length > 0) &&
          this.currentPlaylistId === playlistId
        ) {
          console.log("🔔 Found modifications:", {
            playlistId,
            added: addedVersions.length,
            removed: removedVersions.length,
            addedVersions,
            removedVersions,
          });

          const cleanVersions = freshVersions.map((v) => ({
            id: v.id,
            name: v.name,
            version: v.version,
            reviewSessionObjectId: v.reviewSessionObjectId,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
            playlistId,
          }));

          onModificationsFound(
            addedVersions.length,
            removedVersions.length,
            addedVersions,
            removedVersions,
            cleanVersions,
          );
        }
      } catch (error) {
        console.error("❌ Error polling for changes:", error);
      } finally {
        this.isPolling = false;
      }
    };

    await poll();

    if (this.currentPlaylistId === playlistId) {
      this.pollingInterval = setInterval(poll, PlaylistStore.POLL_INTERVAL);
    }
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log("Stopping polling");
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    this.activePollingIds.clear();
    this.currentPlaylistId = null;
  }

  /**
   * Cleanup method for graceful shutdown
   * Call this when the app is closing or the store is being destroyed
   */
  destroy(): void {
    this.stopPolling();
    this.recentlyProcessedChanges.clear();
    this.recentlyManuallyRemovedIds.clear();
    console.log("🧹 PlaylistStore destroyed and cleaned up");
  }

  private compareVersions(v1: FtrackVersion, v2: FtrackVersion): boolean {
    // Only compare fields that should trigger a version change
    return (
      v1.id === v2.id &&
      v1.version === v2.version &&
      v1.name === v2.name &&
      v1.reviewSessionObjectId === v2.reviewSessionObjectId
    );
  }

  async pollForChanges(playlistId: string): Promise<void> {
    try {
      // Skip if no playlist ID is set
      if (!playlistId) return;

      // Try to get the playlist from DB
      const cached = await this.getPlaylist(playlistId);
      if (!cached) return;

      // Update lastChecked timestamp
      cached.lastChecked = Date.now();
      await db.playlists.put(cached);

      // 1. Get cached versions from IndexedDB
      const cachedVersions = await db.versions
        .where("playlistId")
        .equals(playlistId)
        .filter((v) => !v.isRemoved)
        .toArray();

      // 2. Get fresh versions from Ftrack
      let freshVersions: AssetVersion[] = [];
      try {
        freshVersions =
          await this.ftrackService.getPlaylistVersions(playlistId);
      } catch (error) {
        console.error("🚫 Failed to get fresh versions:", error);
        return;
      }

      // Always apply fresh versions with our special method that preserves published notes
      await this.applyFreshVersionsPreservingStatuses(
        playlistId,
        freshVersions,
      );

      console.log("🔍 Playlist polling:", {
        playlistId,
        cachedCount: cachedVersions.length,
        freshCount: freshVersions.length,
      });

      // Skip detailed comparison for quick notes
      if (playlistId === "quick-notes") return;

      // Create lookup maps for faster comparison
      const freshMap = new Map(
        freshVersions.map((v) => [`${playlistId}:${v.id}`, v]),
      );
      const cachedMap = new Map(
        cachedVersions.map((v) => [`${playlistId}:${v.id}`, v]),
      );

      // Find manually added versions - we'll preserve these
      const manualVersions = cachedVersions.filter((v) => v.manuallyAdded);
      console.log("🤚 Manual versions to preserve:", {
        count: manualVersions.length,
        versions: manualVersions.map((v) => ({
          id: v.id,
          name: v.name,
          manuallyAdded: v.manuallyAdded,
        })),
      });

      // Create a set of manual version IDs for quick lookup
      const manualVersionIds = new Set(manualVersions.map((v) => v.id));

      // Find added versions (in fresh but not in cached)
      const addedVersions = freshVersions
        .filter((v) => {
          const key = `${playlistId}:${v.id}`;
          const notInCached = !cachedMap.has(key);
          if (notInCached) {
            console.log("➕ Potential added version:", {
              id: v.id,
              name: v.name,
              notInCached,
            });
          }
          return notInCached;
        })
        .map((v) => v.id);

      // Find removed versions (in cached but not in fresh)
      // Exclude manually added versions from being considered as removed
      const removedVersions = cachedVersions
        .filter((v) => {
          const key = `${playlistId}:${v.id}`;
          const notInFresh = !freshMap.has(key);
          // If it's manually added, it can't be removed
          if (notInFresh && !manualVersionIds.has(v.id)) {
            console.log("➖ Potential removed version:", {
              id: v.id,
              name: v.name,
              notInFresh,
              isManual: v.manuallyAdded,
            });
            return true;
          }
          return false;
        })
        .map((v) => v.id);

      console.log("✅ Version comparison complete:", {
        added: addedVersions.length,
        removed: removedVersions.length,
        addedIds: addedVersions,
        removedIds: removedVersions,
        preservedManualIds: Array.from(manualVersionIds),
      });

      // Only notify if there are actual changes
      if (
        (addedVersions.length > 0 || removedVersions.length > 0) &&
        this.currentPlaylistId === playlistId
      ) {
        console.log("🔔 Found modifications:", {
          playlistId,
          added: addedVersions.length,
          removed: removedVersions.length,
          addedVersions,
          removedVersions,
        });

        const cleanVersions = freshVersions.map((v) => ({
          id: v.id,
          name: v.name,
          version: v.version,
          reviewSessionObjectId: v.reviewSessionObjectId,
          thumbnailUrl: v.thumbnailUrl,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          playlistId,
        }));

        if (this.pollingCallback) {
          this.pollingCallback(
            addedVersions.length,
            removedVersions.length,
            addedVersions,
            removedVersions,
            cleanVersions,
          );
        }
      }
    } catch (error) {
      console.error("Error polling for changes:", error);
    }
  }

  private async applyFreshVersionsPreservingStatuses(
    playlistId: string,
    freshVersions: AssetVersion[],
  ): Promise<void> {
    try {
      console.log(
        `[PlaylistStore] Applying ${freshVersions.length} fresh versions to playlist ${playlistId}`,
      );

      // First, get all existing versions from DB
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlistId)
        .toArray();

      console.log(
        `[PlaylistStore] Found ${existingVersions.length} existing versions in database`,
      );

      // Create lookup maps for efficient access
      const existingVersionsMap = new Map(
        existingVersions.map((v) => [v.id, v]),
      );

      // Track published notes to ensure we preserve their status
      const publishedNoteIds = new Set(
        existingVersions
          .filter((v) => v.noteStatus === "published")
          .map((v) => v.id),
      );

      if (publishedNoteIds.size > 0) {
        console.log(
          `[PlaylistStore] Preserving ${publishedNoteIds.size} published notes during version update`,
        );
      }

      // Process each fresh version individually
      for (const freshVersion of freshVersions) {
        try {
          const existingVersion = existingVersionsMap.get(freshVersion.id);
          const versionId = freshVersion.id;

          // If this version already exists
          if (existingVersion) {
            // Create updated version object, preserving important fields
            const updatedVersion = {
              id: versionId,
              playlistId,
              name: freshVersion.name || "",
              version: freshVersion.version || 0,
              thumbnailUrl: freshVersion.thumbnailUrl || "",
              thumbnailId: freshVersion.thumbnailId || "",
              reviewSessionObjectId: freshVersion.reviewSessionObjectId || "",
              createdAt: this.cleanDate(freshVersion.createdAt),
              updatedAt: this.cleanDate(freshVersion.updatedAt),
              lastModified: Date.now(),

              // Preserve existing state
              draftContent: existingVersion.draftContent || "",
              labelId: existingVersion.labelId || "",

              // Always preserve published status
              noteStatus: publishedNoteIds.has(versionId)
                ? ("published" as NoteStatus)
                : existingVersion.noteStatus || ("empty" as NoteStatus),

              manuallyAdded: existingVersion.manuallyAdded || false,
              isRemoved: false,
            };

            // Save to database
            await db.versions.put(updatedVersion, [playlistId, versionId]);
          }
          // If it's a new version
          else {
            const newVersion = {
              id: versionId,
              playlistId,
              name: freshVersion.name || "",
              version: freshVersion.version || 0,
              thumbnailUrl: freshVersion.thumbnailUrl || "",
              thumbnailId: freshVersion.thumbnailId || "",
              reviewSessionObjectId: freshVersion.reviewSessionObjectId || "",
              createdAt: this.cleanDate(freshVersion.createdAt),
              updatedAt: this.cleanDate(freshVersion.updatedAt),
              lastModified: Date.now(),
              draftContent: "",
              labelId: "",
              noteStatus: "empty" as NoteStatus,
              manuallyAdded: false,
              isRemoved: false,
            };

            // Save to database
            await db.versions.put(newVersion, [playlistId, versionId]);
          }
        } catch (versionError) {
          console.error(
            `[PlaylistStore] Error processing version ${freshVersion.id}:`,
            versionError,
          );
          // Continue with other versions even if one fails
        }
      }

      console.log(
        `[PlaylistStore] Successfully applied fresh versions to playlist ${playlistId}`,
      );
    } catch (error) {
      console.error("[PlaylistStore] Error applying fresh versions:", error);
      throw error;
    }
  }

  async addVersionToPlaylist(
    playlistId: string,
    version: AssetVersion,
  ): Promise<void> {
    // If a version add is already in progress, wait a moment
    if (this.versionAddInProgress) {
      log(
        `Version add already in progress, waiting before adding ${version.id} to playlist ${playlistId}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    try {
      this.versionAddInProgress = true;
      log(`Adding version ${version.id} to playlist ${playlistId}`);

      // First, get the playlist
      const playlist = await this.getPlaylist(playlistId);
      if (!playlist) {
        throw new Error(`Playlist not found: ${playlistId}`);
      }

      // Check if the version already exists in the playlist
      const versionExists = playlist.versions?.some((v) => v.id === version.id);
      if (versionExists) {
        log(
          `Version ${version.id} already exists in playlist ${playlistId}, skipping`,
        );
        return;
      }

      // Check if the version already exists in the database
      const existingVersion = await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, version.id])
        .first();

      if (existingVersion) {
        log(
          `Version ${version.id} already exists in database for playlist ${playlistId}, skipping`,
        );
        return;
      }

      // Extract only the exact properties we need as primitive values
      // This completely avoids any non-serializable objects or properties
      const versionId = String(version.id);
      const versionName = String(version.name || "");
      const versionNumber = Number(version.version || 0);
      const createdAt = String(version.createdAt || new Date().toISOString());
      const updatedAt = String(version.updatedAt || new Date().toISOString());

      // Optional properties with explicit string conversion
      const thumbnailId = version.thumbnailId
        ? String(version.thumbnailId)
        : null;
      const reviewSessionObjectId = version.reviewSessionObjectId
        ? String(version.reviewSessionObjectId)
        : null;

      // Define type for minimal version object
      const minimalVersion: CachedVersion & {
        thumbnailId?: string;
        reviewSessionObjectId?: string;
      } = {
        id: versionId,
        name: versionName,
        version: versionNumber,
        playlistId: String(playlistId),
        lastModified: Date.now(),
        draftContent: "",
        labelId: "",
        manuallyAdded: true,
        createdAt: createdAt,
        updatedAt: updatedAt,
      };

      // Only add additional properties if they're not null
      if (thumbnailId) {
        minimalVersion["thumbnailId"] = thumbnailId;
      }

      if (reviewSessionObjectId) {
        minimalVersion["reviewSessionObjectId"] = reviewSessionObjectId;
      }

      // Convert to string first to avoid any potential serialization issues
      try {
        log(
          `Adding minimal version to database: ${JSON.stringify({
            id: minimalVersion.id,
            name: minimalVersion.name,
            version: minimalVersion.version,
            // Include other non-complex properties
          })}`,
        );
      } catch (e) {
        log("Couldn't serialize version for logging");
      }

      // Add to database
      await db.versions.put(minimalVersion);

      // Update the playlist's addedVersions array
      if (!playlist.addedVersions.includes(version.id)) {
        playlist.addedVersions = [...playlist.addedVersions, version.id];
        playlist.hasModifications = true;

        // Save the updated playlist
        await this.cachePlaylist(playlist);
      }

      log(`Successfully added version ${versionId} to playlist ${playlistId}`);
    } catch (error) {
      console.error(
        `Failed to add version ${version.id} to playlist ${playlistId}:`,
        error,
      );
      throw error;
    } finally {
      this.versionAddInProgress = false;
    }
  }

  async clearAddedVersions(playlistId: string): Promise<void> {
    try {
      // Get all manually added versions for this playlist
      const manuallyAddedVersions = await db.versions
        .where("playlistId")
        .equals(playlistId)
        .and((version) => version.manuallyAdded === true)
        .toArray();

      log(
        `Found ${manuallyAddedVersions.length} manually added versions to clear for playlist ${playlistId}`,
      );

      if (manuallyAddedVersions.length === 0) {
        log("No manually added versions found to clear");
        return;
      }

      // Extract IDs for tracking
      const versionIds = manuallyAddedVersions.map((v) => v.id);

      // Store these IDs in our tracking map so polling won't report them as removed
      if (!this.recentlyManuallyRemovedIds.has(playlistId)) {
        this.recentlyManuallyRemovedIds.set(playlistId, new Set());
      }
      // Add each ID to the tracking set
      versionIds.forEach((id) => {
        this.recentlyManuallyRemovedIds.get(playlistId)?.add(id);
      });

      // Set a timeout to clean up these IDs after polling cycle completes
      // This ensures we don't keep tracking IDs indefinitely
      setTimeout(() => {
        if (this.recentlyManuallyRemovedIds.has(playlistId)) {
          this.recentlyManuallyRemovedIds.delete(playlistId);
          log(
            `Cleared tracking for manually removed versions in playlist ${playlistId}`,
          );
        }
      }, PlaylistStore.POLL_INTERVAL * 2); // Clear after 2 polling cycles

      // Delete the versions from the database
      await db.versions
        .where("playlistId")
        .equals(playlistId)
        .and((version) => version.manuallyAdded === true)
        .delete();

      // For Quick Notes, also delete any drafts associated with these versions
      if (playlistId === "quick-notes") {
        // Delete any drafts for these versions
        for (const versionId of versionIds) {
          try {
            await db.versions
              .where("[playlistId+id]")
              .equals([playlistId, versionId])
              .delete();
          } catch (err) {
            console.error(
              `Failed to delete draft for version ${versionId}:`,
              err,
            );
          }
        }
      }

      // Update the cached playlist to reflect the changes
      const cachedPlaylist = await this.getPlaylist(playlistId);
      if (cachedPlaylist) {
        // Filter out manually added versions from the playlist
        if (cachedPlaylist.versions) {
          cachedPlaylist.versions = cachedPlaylist.versions.filter(
            (v) => !v.manuallyAdded,
          );
        }

        // Clear the addedVersions array
        cachedPlaylist.addedVersions = [];
        cachedPlaylist.hasModifications = true;

        // Store the IDs in removedVersions for reference
        // But we'll exclude these from polling notifications
        cachedPlaylist.removedVersions = [
          ...cachedPlaylist.removedVersions,
          ...versionIds,
        ];

        // Save the updated playlist back to the database
        await this.cachePlaylist(cachedPlaylist);

        log(
          `Cleared ${manuallyAddedVersions.length} manually added versions from playlist ${playlistId}`,
        );
      } else {
        log(
          `Warning: Could not find cached playlist ${playlistId} to update after clearing versions`,
        );
      }
    } catch (error) {
      console.error("Failed to clear manually added versions:", error);
      throw error;
    }
  }

  private cleanupExpiredProcessedChanges(): void {
    const now = Date.now();
    const expiredPlaylists: string[] = [];

    for (const [playlistId, data] of this.recentlyProcessedChanges) {
      // Clear entries older than 30 seconds (now that we fixed the root cause)
      if (now - data.timestamp > 30000) {
        expiredPlaylists.push(playlistId);
      }
    }

    if (expiredPlaylists.length > 0) {
      expiredPlaylists.forEach((playlistId) => {
        this.recentlyProcessedChanges.delete(playlistId);
      });
      console.log(
        `🧹 Cleaned up ${expiredPlaylists.length} expired processed change entries`,
      );
    }
  }
}

export const playlistStore = new PlaylistStore(new FtrackService());
