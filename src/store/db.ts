/**
 * @fileovview db.ts
 * IndexedDB database management using Dexie.
 * Handles:
 * - Playlist and version caching
 * - Draft note storage
 * - Data cleanup and migration
 * - Cache invalidation
 * - Note attachments storage
 */

import Dexie, { type Table } from "dexie";
import type { Playlist, AssetVersion, NoteStatus } from "@/types";

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

export interface CachedVersion extends AssetVersion {
  playlistId: string;
  draftContent?: string;
  noteStatus?: NoteStatus;
  lastModified: number;
  labelId: string;
  isRemoved?: boolean;
  attachments?: NoteAttachment[];
}

export interface CachedPlaylist extends Playlist {
  lastAccessed: number;
  lastChecked: number;
  hasModifications: boolean;
  addedVersions: string[];
  removedVersions: string[];
}

export class AstraNotesDB extends Dexie {
  playlists!: Table<CachedPlaylist>;
  versions!: Table<CachedVersion>;
  attachments!: Table<NoteAttachment>;

  constructor() {
    super("AstraNotesDB");
    console.log("Initializing AstraNotesDB schema...");

    this.version(3).stores({
      playlists: "id, lastAccessed, lastChecked",
      versions:
        "[playlistId+id], playlistId, lastModified, draftContent, labelId, name, version, thumbnailUrl, reviewSessionObjectId, createdAt, updatedAt, isRemoved, lastChecked, noteStatus",
      attachments:
        "id, [versionId+playlistId], versionId, playlistId, noteId, createdAt",
    });

    this.versions.hook("creating", function (primKey, obj) {
      //console.log('Creating version:', { primKey, obj });
      return obj;
    });

    this.versions.hook("reading", function (obj) {
      //console.log('Reading version:', obj);
      return obj;
    });

    console.log("Schema initialized:", {
      playlists: this.playlists.schema.indexes.map((i) => i.keyPath),
      versions: this.versions.schema.indexes.map((i) => i.keyPath),
      attachments: this.attachments.schema.indexes.map((i) => i.keyPath),
    });
  }

  async cleanOldData() {
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    await this.playlists.where("lastAccessed").below(sixtyDaysAgo).delete();

    // Get all active playlist IDs
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

  async clearCache() {
    try {
      // Close current connection
      this.close();

      // Delete the database
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

      // Clear localStorage items
      localStorage.clear();
      localStorage.setItem("active-playlist", "quick-notes");
      localStorage.setItem("playlist-tabs", JSON.stringify(["quick-notes"]));

      // Force a full page reload to clear everything
      window.location.href = "/";
    } catch (error) {
      console.error("Failed to clear cache:", error);
      throw error;
    }
  }
}

export const db = new AstraNotesDB();
