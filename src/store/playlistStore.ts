import { db } from "./db";
import { Playlist } from "../types";
import { UpdateSpec } from "dexie";
import { FtrackService } from "../services/ftrack";

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
  createdAt: string;
  updatedAt: string;
  reviewSessionObjectId?: string;
  thumbnailUrl?: string;
}

interface StorableVersion {
  id: string;
  playlistId: string;
  lastModified: number;
  draftContent?: string;
  labelId: string;
  name: string;
  version: number;
  thumbnail_url?: URL;
  thumbnailUrl?: string;
  reviewSessionObjectId?: string;
  createdAt: string;
  updatedAt: string;
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
  private currentPlaylistId: string | null = null;
  private isPolling = false;
  private ftrackService: FtrackService;

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

  private cleanDate(date: any): string {
    // If it's a Moment object (has format function), convert to ISO string
    if (date && typeof date.format === "function") {
      return date.format();
    }
    // If it's already a string, return as is
    if (typeof date === "string") {
      return date;
    }
    // If it's a Date object, convert to ISO string
    if (date instanceof Date) {
      return date.toISOString();
    }
    // Fallback
    return new Date().toISOString();
  }

  private cleanPlaylistForStorage(playlist: Playlist): CachedPlaylist {
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
        reviewSessionObjectId: v.reviewSessionObjectId,
        thumbnailUrl: v.thumbnailUrl,
        createdAt: this.cleanDate(v.createdAt),
        updatedAt: this.cleanDate(v.updatedAt),
      })),
      notes: (playlist.notes || []).map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: this.cleanDate(n.createdAt),
        updatedAt: this.cleanDate(n.updatedAt),
        createdById: n.createdById,
        author: n.author,
      })),
      lastAccessed: Date.now(),
      lastChecked: Date.now(),
      hasModifications: false,
      addedVersions: [],
      removedVersions: [],
    };

    return cleanPlaylist;
  }

  private cleanVersion(version: FtrackVersion, playlistId: string): StorableVersion {
    // Create a new object with only serializable properties
    return {
      id: version.id,
      playlistId,
      lastModified: Date.now(),
      name: version.name,
      version: version.version,
      thumbnail_url: version.thumbnail_url,
      thumbnailUrl: version.thumbnailUrl,
      reviewSessionObjectId: version.reviewSessionObjectId,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      labelId: '',
    };
  }

  async getPlaylist(id: string): Promise<CachedPlaylist | undefined> {
    log("Getting playlist from cache:", id);
    const cached = await db.playlists.get(id);
    if (!cached) return undefined;

    // Get all versions for this playlist
    const versions = await db.versions
      .where("playlistId")
      .equals(id)
      .filter((v) => !v.isRemoved)
      .toArray();

    log("Found versions in cache:", versions.length);
    return {
      ...cached,
      versions,
    };
  }

  async getDraftContent(versionId: string): Promise<{ content?: string; labelId?: string }> {
    try {
      const version = await db.versions.get(versionId);
      return {
        content: version?.draftContent,
        labelId: version?.labelId,
      };
    } catch (error) {
      console.error("Failed to get draft content:", error);
      return {};
    }
  }

  async saveDraft(versionId: string, content: string, labelId: string = ''): Promise<void> {
    try {
      const version = await db.versions.get(versionId);
      if (version) {
        const updates: Partial<CachedVersion> = {
          draftContent: content,
          labelId,
          lastModified: Date.now(),
        };
        await db.versions.update(versionId, updates);
      }
    } catch (error) {
      console.error("Failed to save draft:", error);
      throw error;
    }
  }

  async cachePlaylist(playlist: Playlist): Promise<void> {
    try {
      log("Caching playlist:", playlist.id);
      const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);

      // Update the playlist in the cache
      await db.playlists.put(cleanedPlaylist);

      // Get current versions to preserve draft content
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlist.id)
        .toArray();

      const draftMap = new Map(
        existingVersions.map((v) => [v.id, (v as CachedVersion).draftContent]),
      );

      const labelIdMap = new Map(
        existingVersions.map((v) => [v.id, (v as CachedVersion).labelId]),
      );

      // Cache versions, preserving draft content for existing versions
      if (playlist.versions) {
        // Create a composite key for each version that includes the playlist ID
        const versionUpdates = playlist.versions.map((version) => {
          const cleanVersion = this.cleanVersion(version, playlist.id);

          // Add draft content if it exists
          const existingDraft = draftMap.get(version.id);
          if (existingDraft) {
            return {
              ...cleanVersion,
              draftContent: existingDraft,
            } as CachedVersion;
          }

          const existingLabelId = labelIdMap.get(version.id);
          if (existingLabelId) {
            return {
              ...cleanVersion,
              labelId: existingLabelId,
            } as CachedVersion;
          }
          return cleanVersion;
        });

        // Bulk put all versions
        await db.versions.bulkPut(versionUpdates);

        // Remove versions that are no longer in the playlist
        const currentVersionIds = new Set(playlist.versions.map((v) => v.id));
        await db.versions
          .where("playlistId")
          .equals(playlist.id)
          .filter((v) => !currentVersionIds.has(v.id))
          .delete();
      }
    } catch (err) {
      log("Warning: Error in cachePlaylist:", err);
    }
  }

  async initializePlaylist(playlistId: string, playlist: Playlist) {
    // Stop any existing polling before initializing
    this.stopPolling();

    // Set as current playlist
    this.currentPlaylistId = playlistId;

    // Cache the playlist first to ensure we have the latest state
    await this.cachePlaylist(playlist);

    // Try to restore any existing drafts
    const versions = playlist.versions || [];
    await Promise.all(
      versions.map(async (version) => {
        const draftContent = await this.getDraftContent(version.id);
        if (draftContent.content) {
          await this.saveDraft(version.id, draftContent.content, draftContent.labelId);
        }
      }),
    );
  }

  async updatePlaylist(playlistId: string): Promise<void> {
    log("Updating playlist with fresh data:", playlistId);
    const fresh = await this.ftrackService.getPlaylists();
    const freshPlaylist = fresh.find((p) => p.id === playlistId);
    if (!freshPlaylist) {
      log("No playlist found with id:", playlistId);
      return;
    }

    // Get current cached versions before updating
    const cached = await this.getPlaylist(playlistId);
    const cachedVersionIds = new Set((cached?.versions || []).map((v) => v.id));
    const freshVersionIds = new Set(
      (freshPlaylist.versions || []).map((v) => v.id),
    );

    // Check for modifications
    const addedVersions = (freshPlaylist.versions || [])
      .filter((v) => !cachedVersionIds.has(v.id))
      .map((v) => v.id);

    const removedVersions = (cached?.versions || [])
      .filter((v) => !freshVersionIds.has(v.id))
      .map((v) => v.id);

    if (addedVersions.length > 0 || removedVersions.length > 0) {
      log("Found modifications:", {
        playlistId,
        added: addedVersions.length,
        removed: removedVersions.length,
        addedVersions,
        removedVersions,
      });
    }

    // Update cache with fresh data
    await this.cachePlaylist(freshPlaylist);
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

    // Restart polling with the same callback
    await this.startPolling(playlistId, onModificationsFound);
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
  ) {
    log("Starting polling for playlist:", playlistId);

    // If we're already polling for a different playlist, stop that first
    if (this.currentPlaylistId !== playlistId) {
      this.stopPolling();
    }

    // Clear any existing interval and reset state
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.currentPlaylistId = playlistId;

    // Set a small delay before starting the first poll to avoid race conditions with playlist initialization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Define the poll function
    const poll = async () => {
      // If we're already polling or this isn't the current playlist anymore, skip
      if (this.isPolling || this.currentPlaylistId !== playlistId) {
        return;
      }

      this.isPolling = true;

      try {
        log("Polling for changes on playlist:", playlistId);
        const cached = await this.getPlaylist(playlistId);
        if (!cached) {
          log("No cached playlist found:", playlistId);
          return;
        }

        // Get fresh versions for the current playlist
        const freshVersions =
          await this.ftrackService.getPlaylistVersions(playlistId);

        // Compare with cached versions using a Set for O(1) lookups
        const cachedVersionIds = new Set(
          (cached.versions || []).map((v) => v.id),
        );
        const freshVersionIds = new Set(freshVersions.map((v) => v.id));

        // Deep compare versions to avoid false positives
        const addedVersions = freshVersions
          .filter((v) => !cachedVersionIds.has(v.id))
          .map((v) => v.id);

        const removedVersions = (cached.versions || [])
          .filter((v) => !freshVersionIds.has(v.id))
          .map((v) => v.id);

        // Only notify if there are actual changes and this is still the current playlist
        if (
          (addedVersions.length > 0 || removedVersions.length > 0) &&
          this.currentPlaylistId === playlistId
        ) {
          log("Found modifications:", {
            playlistId,
            added: addedVersions.length,
            removed: removedVersions.length,
            addedVersions,
            removedVersions,
          });

          // Clean versions before passing to callback
          const cleanVersions = freshVersions.map((v) => ({
            id: v.id,
            name: v.name,
            version: v.version,
            reviewSessionObjectId: v.reviewSessionObjectId,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
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
        log("Error polling for changes:", error);
      } finally {
        this.isPolling = false;
      }
    };

    // Run the first poll after the delay
    await poll();

    // Start a fresh polling interval if this is still the current playlist
    if (this.currentPlaylistId === playlistId) {
      this.pollingInterval = setInterval(poll, PlaylistStore.POLL_INTERVAL);
    }
  }

  stopPolling() {
    if (this.pollingInterval) {
      log("Stopping polling");
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
  }

  async updateVersions(versions: FtrackVersion[]): Promise<void> {
    await Promise.all(
      versions.map(async (version) => {
        const draftContent = await this.getDraftContent(version.id);
        if (draftContent.content) {
          const storedVersion = await db.versions.get(version.id);
          const updates: Partial<CachedVersion> = {
            draftContent: draftContent.content,
            labelId: draftContent.labelId || '',
            lastModified: Date.now(),
          };
          if (storedVersion) {
            await db.versions.update(version.id, updates);
          }
        }
      }),
    );
  }

  private async pollForChanges(
    playlist: Playlist,
    onModificationsFound: (
      addedCount: number,
      removedCount: number,
      versions: FtrackVersion[],
    ) => void,
  ): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      // Get fresh versions from ftrack
      const freshVersions = await this.ftrackService.getVersions(playlist.id);

      // Get existing versions from db
      const existingVersions = await db.versions
        .where("playlistId")
        .equals(playlist.id)
        .toArray();

      // Create maps for easy lookup
      const freshVersionMap = new Map(
        freshVersions.map((v: FtrackVersion) => [v.id, v]),
      );
      const existingVersionMap = new Map(
        existingVersions.map((v: CachedVersion) => [v.id, v]),
      );

      // Find added and removed versions
      const addedVersions = freshVersions
        .filter((v: FtrackVersion) => !existingVersionMap.has(v.id))
        .map((v: FtrackVersion) => v.id);

      const removedVersions = existingVersions
        .filter((v: CachedVersion) => !freshVersionMap.has(v.id))
        .map((v: CachedVersion) => v.id);

      if (addedVersions.length > 0 || removedVersions.length > 0) {
        // Clean versions before passing to callback
        const cleanVersions = freshVersions.map((v: FtrackVersion) => ({
          id: v.id,
          name: v.name,
          version: v.version,
          reviewSessionObjectId: v.reviewSessionObjectId,
          thumbnailUrl: v.thumbnailUrl,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        }));

        onModificationsFound(
          addedVersions.length,
          removedVersions.length,
          cleanVersions,
        );
      }
    } catch (error) {
      console.error("Failed to poll for changes:", error);
    }
    this.isPolling = false;
  }
}

export const playlistStore = new PlaylistStore(new FtrackService());
