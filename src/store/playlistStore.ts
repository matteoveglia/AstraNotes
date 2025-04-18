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

  constructor(ftrackService: FtrackService) {
    this.ftrackService = ftrackService;
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
      // Get the playlist from cache
      const cached = await db.playlists.get(id);

      // Get versions from IndexedDB (our source of truth)
      const dbVersions = await db.versions
        .where("playlistId")
        .equals(id)
        .filter((v) => !v.isRemoved)
        .toArray();

      // If no versions in cache but playlist has versions, try to initialize
      if (
        dbVersions.length === 0 &&
        cached?.versions &&
        cached.versions.length > 0
      ) {
        await this.initializePlaylist(id, cached);
        // Try getting versions again
        return this.getPlaylist(id);
      }

      if (!cached) {
        return null;
      }

      // Create maps for quick lookup
      const dbVersionsMap = new Map(dbVersions.map((v) => [v.id, v]));
      const cachedVersionsMap = new Map(
        cached.versions?.map((v) => [v.id, v]) || [],
      );

      // Handle all playlists including Quick Notes consistently
      // 1. Start with versions from IndexedDB that are either:
      //    - Present in the cached versions (from Ftrack)
      //    - Manually added
      // 2. Add any cached versions that aren't in IndexedDB
      const mergedVersions = [
        // First, include all DB versions that are either in cache or manually added
        ...dbVersions
          .filter((v) => cachedVersionsMap.has(v.id) || v.manuallyAdded)
          .map((v) => {
            const cachedVersion = cachedVersionsMap.get(v.id);
            // If it exists in cache, merge with DB version
            if (cachedVersion) {
              return {
                ...cachedVersion,
                draftContent: v.draftContent || "",
                labelId: v.labelId || "",
                manuallyAdded: v.manuallyAdded || false,
                noteStatus: v.noteStatus,
              };
            }
            // Otherwise just use the DB version
            return v;
          }),

        // Then add any cached versions that aren't in DB
        ...(cached.versions
          ?.filter((v) => !dbVersionsMap.has(v.id))
          .map((v) => ({
            ...v,
            manuallyAdded: false,
            draftContent: "",
            labelId: "",
            noteStatus: "empty",
          })) || []),
      ];

      // Sort versions by name and version number
      cached.versions = mergedVersions.sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return (b.version || 0) - (a.version || 0);
      });

      // Explicitly load attachments for versions
      const attachments = await db.attachments
        .where("playlistId")
        .equals(id)
        .toArray();

      console.log(
        `[PlaylistStore] Loaded ${attachments.length} attachments for playlist ${id}`,
      );

      // Create a safe serializable copy of attachments to avoid blob serialization issues
      const safeAttachments = attachments.map((att) => {
        // Create a copy without the data property to avoid serialization issues
        const { data, ...safePart } = att;
        return safePart;
      });

      // Create a map of version IDs to attachments for efficient lookup
      const attachmentMap = new Map();
      safeAttachments.forEach((att) => {
        if (!attachmentMap.has(att.versionId)) {
          attachmentMap.set(att.versionId, []);
        }
        attachmentMap.get(att.versionId).push(att);
      });

      // Attach attachments to version objects
      cached.versions = cached.versions.map((version) => {
        const versionAttachments = attachmentMap.get(version.id) || [];

        if (versionAttachments.length > 0) {
          console.log(
            `[PlaylistStore] Version ${version.id} has ${versionAttachments.length} attachments`,
          );

          // Store the raw attachment reference data on the version
          (version as any).attachments = versionAttachments;
        } else {
          // Ensure versions without attachments have an empty array
          (version as any).attachments = [];
        }

        return version;
      });

      return cached;
    } catch (error) {
      console.error("Failed to get playlist:", error);
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
      // Get current versions to preserve draft content
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlist.id)
        .toArray();

      const draftMap = new Map(
        existingVersions.map((v) => [v.id, v.draftContent]),
      );

      const labelIdMap = new Map(
        existingVersions.map((v) => [v.id, v.labelId]),
      );

      const noteStatusMap = new Map(
        existingVersions.map((v) => [v.id, v.noteStatus]),
      );

      // Create a map of attachment arrays by version ID
      // Make sure to create a safe copy without binary data to prevent serialization errors
      const attachmentsMap = new Map();

      existingVersions.forEach((v) => {
        if (v.attachments && v.attachments.length > 0) {
          // Create safe copies of attachments that exclude binary data
          const safeAttachments = v.attachments.map((att) => {
            // Exclude data property and any File/Blob references that can't be serialized
            const { data, file, ...safePart } = att as any;
            return safePart;
          });
          attachmentsMap.set(v.id, safeAttachments);
        } else {
          attachmentsMap.set(v.id, []);
        }
      });

      // Create a lookup map of existing versions
      const existingVersionMap = new Map(
        existingVersions.map((v) => [v.id, v]),
      );

      // Cache the playlist
      await db.playlists.put(playlist);

      // Save versions with preserved draft content and statuses
      if (playlist.versions) {
        await Promise.all(
          playlist.versions.map(async (version) => {
            // Get existing version data if it exists
            const existingVersion = existingVersionMap.get(version.id);

            // Prioritize keeping published status
            let noteStatus;
            if (existingVersion?.noteStatus === "published") {
              // Always preserve published status
              noteStatus = "published";
            } else {
              // Otherwise use existing status or default
              noteStatus =
                noteStatusMap.get(version.id) ||
                (version as any).noteStatus ||
                "empty";
            }

            // Get safe attachments for this version
            const safeAttachments = attachmentsMap.get(version.id) || [];

            // If version has its own attachments, create safe copies
            if (
              (version as any).attachments &&
              (version as any).attachments.length > 0
            ) {
              try {
                // Create safe copies of attachments that exclude binary data
                const versionSafeAttachments = (version as any).attachments.map(
                  (att: any) => {
                    // Exclude data property and any File/Blob references
                    const { data, file, ...safePart } = att;
                    return safePart;
                  },
                );

                // Use the newly processed attachments
                safeAttachments.push(...versionSafeAttachments);
              } catch (attachError) {
                console.warn(
                  `Could not process attachments for version ${version.id}:`,
                  attachError,
                );
                // Continue with existing safe attachments
              }
            }

            const versionToSave = {
              ...version,
              playlistId: playlist.id,
              // Preserve existing draft content and labels
              draftContent: draftMap.get(version.id) || "",
              labelId: labelIdMap.get(version.id) || "",
              lastModified: Date.now(),
              // Explicitly preserve the note status, especially published status
              noteStatus: noteStatus,
              // Preserve manually added flag
              manuallyAdded:
                existingVersion?.manuallyAdded ||
                version.manuallyAdded ||
                false,
              // Store safe serializable attachments
              attachments: safeAttachments,
            };

            await db.versions.put(versionToSave, [playlist.id, version.id]);
          }),
        );
      }
    } catch (err) {
      console.error("Error in cachePlaylist:", err);
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
      const mergedVersions = [
        // First, process all DB versions
        ...dbVersions
          .map((dbVersion) => {
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
          })
          .filter((v) => !v.isRemoved), // Filter out removed versions

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
      // First, get all existing versions from DB
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlistId)
        .toArray();

      // Create a lookup map for existing versions
      const existingVersionsMap = new Map(
        existingVersions.map((v) => [v.id, v]),
      );

      // Get all published notes to ensure we preserve their status
      const publishedNotes = existingVersions.filter(
        (v) => v.noteStatus === "published",
      );
      const publishedNoteIds = new Set(publishedNotes.map((v) => v.id));

      if (publishedNoteIds.size > 0) {
        console.debug(
          `[playlistStore] Preserving ${publishedNoteIds.size} published notes during version update`,
        );
      }

      // Process and save fresh versions
      await Promise.all(
        freshVersions.map(async (freshVersion) => {
          const existingVersion = existingVersionsMap.get(freshVersion.id);

          // If version exists in DB
          if (existingVersion) {
            // Prepare updated version, preserving draft content, labels, and published status
            const updatedVersion: CachedVersion = {
              ...(freshVersion as any), // Cast to any to avoid TypeScript errors
              playlistId,
              draftContent: existingVersion.draftContent || "",
              labelId: existingVersion.labelId || "",
              lastModified: Date.now(),
              // Always preserve published status
              noteStatus: publishedNoteIds.has(freshVersion.id)
                ? ("published" as NoteStatus) // Force published if it was published before
                : existingVersion.noteStatus || ("empty" as NoteStatus),
              manuallyAdded: existingVersion.manuallyAdded || false,
              isRemoved: false,
            };

            // Save updated version to DB
            await db.versions.put(updatedVersion, [
              playlistId,
              freshVersion.id,
            ]);
          }
          // If version is new
          else {
            // Create new version with default values
            const newVersion: CachedVersion = {
              ...(freshVersion as any), // Cast to any to avoid TypeScript errors
              playlistId,
              draftContent: "",
              labelId: "",
              lastModified: Date.now(),
              noteStatus: "empty" as NoteStatus, // Default to empty for new versions
              manuallyAdded: false,
              isRemoved: false,
            };

            // Save new version to DB
            await db.versions.put(newVersion, [playlistId, freshVersion.id]);
          }
        }),
      );
    } catch (error) {
      console.error("[playlistStore] Error applying fresh versions:", error);
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

      // Delete the versions from the database
      await db.versions
        .where("playlistId")
        .equals(playlistId)
        .and((version) => version.manuallyAdded === true)
        .delete();

      // For Quick Notes, also delete any drafts associated with these versions
      if (playlistId === "quick-notes") {
        // Get the IDs of all manually added versions
        const versionIds = manuallyAddedVersions.map((v) => v.id);

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
        cachedPlaylist.removedVersions = [
          ...cachedPlaylist.removedVersions,
          ...manuallyAddedVersions.map((v) => v.id),
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
}

export const playlistStore = new PlaylistStore(new FtrackService());
