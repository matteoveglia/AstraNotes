/**
 * @fileoverview db.ts
 * IndexedDB database management using Dexie.
 * Handles:
 * - Playlist and version caching with stable UUIDs
 * - Draft note storage
 * - Data cleanup and migration
 * - Cache invalidation
 * - Note attachments storage
 */

import Dexie, { type Table } from "dexie";
import type { AssetVersion, NoteStatus } from "@/types";

export interface NoteAttachment {
  id: string;
  noteId: string;
  versionId: string;
  playlistId: string;
  name: string;
  type: string;
  size: number;
  data?: Blob; // For browser storage
  previewUrl: string;
  createdAt: number;
  filePath?: string; // For Tauri file paths
  dataRemoved?: boolean; // Flag to indicate data was intentionally removed
  errorMessage?: string; // Store any error message that occurred during processing
}

/**
 * Archived notes for removed versions (note preservation)
 * Keyed by stable playlist UUID + version ID
 */
// Note preservation uses soft-deleted versions with isRemoved flag; no separate archive table

/**
 * New unified playlist record with stable UUID identity
 * Uses stable UUIDs that never change, with separate external references
 */
export interface PlaylistRecord {
  id: string; // STABLE UUID - never changes
  name: string;
  type?: "reviewsession" | "list"; // Optional for backward compatibility

  // Status management - clear separation of local vs ftrack state
  localStatus?: "draft" | "ready_to_sync" | "synced"; // Optional for backward compatibility
  ftrackSyncStatus?: "not_synced" | "syncing" | "synced" | "failed"; // Optional for backward compatibility
  ftrackStatus?: "open" | "closed"; // Only for synced playlists

  // External references - separate from identity
  ftrackId?: string; // Reference to ftrack entity (NULL until synced)
  projectId?: string; // Optional for backward compatibility
  categoryId?: string;
  categoryName?: string;
  description?: string;
  deletedInFtrack?: boolean; // Whether this playlist has been deleted in ftrack but still exists locally

  // Timestamps
  createdAt: string;
  updatedAt: string;
  syncedAt?: string; // When sync was completed
  lastChecked?: string | number; // Last time we checked ftrack status (backward compatibility)
}

/**
 * Enhanced version record with stable playlist reference
 */
export interface VersionRecord {
  id: string; // Version ID from ftrack
  playlistId: string; // STABLE playlist UUID reference

  // Version data
  name: string;
  version: number;
  thumbnailUrl?: string; // Optional for backward compatibility
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  createdAt: string;
  updatedAt: string;

  // Draft/note data - persists through sync
  draftContent?: string;
  labelId: string; // Required for compatibility
  noteStatus?: "empty" | "draft" | "published" | "reviewed"; // Optional for backward compatibility

  // Metadata
  addedAt?: string; // When added to playlist (optional for backward compatibility)
  lastModified: number; // Draft modification timestamp
  manuallyAdded?: boolean; // User-added vs auto-populated (optional for backward compatibility)
  isRemoved?: boolean; // Soft delete flag

  // Backward compatibility for attachments
  attachments?: NoteAttachment[];

  // Legacy fields for backward compatibility
  isLocalPlaylist?: boolean; // Deprecated: use playlist-level status instead
  localPlaylistAddedAt?: string; // Deprecated: use addedAt instead
  syncedAt?: string; // Deprecated: use playlist-level syncedAt instead
}

// Legacy interfaces for backward compatibility during migration
export interface CachedVersion extends AssetVersion {
  playlistId: string;
  draftContent?: string;
  noteStatus?: NoteStatus;
  lastModified: number;
  labelId: string;
  isRemoved?: boolean;
  attachments?: NoteAttachment[];
  // NEW: Fields for playlist consolidation
  isLocalPlaylist?: boolean; // marks versions in local playlists
  syncedAt?: string; // when synced to ftrack
  localPlaylistAddedAt?: string; // replaces localPlaylistVersions.addedAt
}

// Legacy playlist interface for backward compatibility
export interface CachedPlaylist {
  id: string;
  name: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastAccessed: number;
  lastChecked: number;
  hasModifications: boolean;
  addedVersions: string[];
  removedVersions: string[];
  isQuickNotes?: boolean;
  versions?: AssetVersion[];
  notes?: any[];

  // Additional fields for compatibility with new schema
  type?: "reviewsession" | "list";
  projectId?: string;
  categoryId?: string;
  categoryName?: string;
  ftrackId?: string;
  isLocalOnly?: boolean;
  ftrackSyncState?: "not_synced" | "syncing" | "synced" | "failed" | "pending";

  // New status fields mapped from PlaylistRecord
  localStatus?: "draft" | "ready_to_sync" | "synced";
  ftrackSyncStatus?: "not_synced" | "syncing" | "synced" | "failed";
}

// Legacy interfaces removed - no migration needed per user directive

export class AstraNotesDB extends Dexie {
  // New unified tables with stable UUIDs
  playlists!: Table<PlaylistRecord>;
  versions!: Table<VersionRecord>;
  attachments!: Table<NoteAttachment>;
  // No separate archive table; preservation handled via soft deletes

  // Legacy tables removed - no migration needed per user directive

  constructor() {
    super("AstraNotesDB");
    console.log("Initializing AstraNotesDB schema with stable UUIDs...");

    // Version 7: Stable UUID architecture with legacy tables removed
    this.version(7).stores({
      // Unified tables with stable UUIDs
      playlists:
        "id, ftrackId, projectId, localStatus, ftrackSyncStatus, type, createdAt",
      versions:
        "[playlistId+id], playlistId, lastModified, noteStatus, isRemoved",
      attachments:
        "id, [versionId+playlistId], versionId, playlistId, noteId, createdAt",
    });

    // No version 8 changes required for note preservation

    // Previous version maintained for upgrade path
    this.version(6).stores({
      playlists:
        "id, ftrackId, projectId, localStatus, ftrackSyncStatus, type, createdAt",
      versions:
        "[playlistId+id], playlistId, lastModified, noteStatus, isRemoved",
      attachments:
        "id, [versionId+playlistId], versionId, playlistId, noteId, createdAt",
    });

    this.versions.hook("creating", function (primKey, obj) {
      console.log("Creating version with stable playlist reference:", {
        primKey,
        playlistId: obj.playlistId,
      });
      return obj;
    });

    this.versions.hook("reading", function (obj) {
      return obj;
    });

    console.log("Schema initialized with stable UUID architecture:", {
      playlists: this.playlists.schema.indexes.map((i) => i.keyPath),
      versions: this.versions.schema.indexes.map((i) => i.keyPath),
      attachments: this.attachments.schema.indexes.map((i) => i.keyPath),
    });
  }

  async cleanOldData() {
    const _sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

    // Get all active playlist IDs from unified table
    const activePlaylists = await this.playlists.toArray();
    const activePlaylistIds = new Set(activePlaylists.map((p) => p.id));

    // Delete versions from inactive playlists
    await this.versions
      .where("playlistId")
      .noneOf([...activePlaylistIds])
      .delete();

    // Delete attachments from inactive playlists
    await this.attachments
      .where("playlistId")
      .noneOf([...activePlaylistIds])
      .delete();
  }

  /**
   * Clear database - nukes the entire IndexedDB database
   * Does NOT touch localStorage settings (preserves API keys, theme, etc.)
   * Only resets minimal playlist state and reloads the app
   */
  async clearCache() {
    try {
      console.log("Clearing entire database...");

      // Close current connection
      this.close();

      // Delete the entire IndexedDB database
      const deleteRequest = indexedDB.deleteDatabase("AstraNotesDB");

      await new Promise((resolve, reject) => {
        deleteRequest.onsuccess = () => {
          console.log("Database deleted successfully");
          resolve(true);
        };
        deleteRequest.onerror = () => {
          reject(new Error("Could not delete database"));
        };
      });

      // Only reset minimal playlist state - do NOT touch other localStorage settings
      // Use default project-scoped Quick Notes ID
      const defaultQuickNotesId = "quick-notes-default";
      localStorage.setItem("active-playlist", defaultQuickNotesId);
      localStorage.setItem(
        "playlist-tabs",
        JSON.stringify([defaultQuickNotesId]),
      );

      console.log("Database cleared successfully - reloading app");

      // Force a full page reload to restart with fresh database
      window.location.reload();
    } catch (error) {
      console.error("Failed to clear database:", error);
      throw error;
    }
  }

  /**
   * Helper method to clean version data for storage in new unified schema
   */
  cleanVersionForStorage(
    version: any,
    playlistId: string,
    isManuallyAdded = false,
    addedAt?: string,
  ): VersionRecord {
    return {
      id: version.id,
      playlistId, // Stable UUID reference

      // Version data
      name: version.name || "",
      version: version.version || 1,
      thumbnailUrl: version.thumbnailUrl || version.thumbnail_url,
      thumbnailId: version.thumbnailId || "",
      reviewSessionObjectId: version.reviewSessionObjectId || "",
      createdAt:
        typeof version.createdAt === "string"
          ? version.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof version.updatedAt === "string"
          ? version.updatedAt
          : new Date().toISOString(),

      // Draft/note data
      draftContent: version.draftContent,
      labelId: version.labelId || "",
      noteStatus: version.noteStatus || "empty",

      // Metadata
      addedAt:
        addedAt ||
        version.addedAt ||
        version.localPlaylistAddedAt ||
        new Date().toISOString(),
      lastModified: Date.now(),
      manuallyAdded: isManuallyAdded || version.manuallyAdded || false,
      isRemoved: version.isRemoved || false,

      // Backward compatibility
      attachments: version.attachments || [],

      // Legacy fields (for backward compatibility during transition)
      isLocalPlaylist: version.isLocalPlaylist,
      localPlaylistAddedAt: version.localPlaylistAddedAt,
      syncedAt: version.syncedAt,
    };
  }

  /**
   * Helper to create new playlist record with stable UUID
   */
  createPlaylistRecord(data: {
    name: string;
    type: "reviewsession" | "list";
    projectId: string;
    categoryId?: string;
    categoryName?: string;
    description?: string;
    ftrackId?: string;
  }): PlaylistRecord {
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(), // Stable UUID that never changes
      name: data.name,
      type: data.type,

      // Initial status - local until synced
      localStatus: data.ftrackId ? "synced" : "draft",
      ftrackSyncStatus: data.ftrackId ? "synced" : "not_synced",

      // External references
      ftrackId: data.ftrackId,
      projectId: data.projectId,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      description: data.description,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      syncedAt: data.ftrackId ? now : undefined,
    };
  }
}

export const db = new AstraNotesDB();
