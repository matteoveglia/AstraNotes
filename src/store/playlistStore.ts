import { db } from "./db";
import { Playlist } from "../types";
import { UpdateSpec } from "dexie";
import Dexie from "dexie";
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
      reviewSessionObjectId: version.reviewSessionObjectId || "",
      createdAt: this.cleanDate(version.createdAt),
      updatedAt: this.cleanDate(version.updatedAt),
      lastModified: Date.now(),
      draftContent: "",  // Initialize with empty draft
      labelId: "",      // Initialize with empty label
    };
  }

  async getPlaylist(id: string): Promise<CachedPlaylist | undefined> {
    try {
      log("Getting playlist from cache:", id);
      const cached = await db.playlists.get(id);
      if (!cached) {
        log("Playlist not found in cache:", id);
        return undefined;
      }

      // Get all versions for this playlist using the compound index
      const versions = await db.versions
        .where('[playlistId+id]')
        .between(
          [id, Dexie.minKey],
          [id, Dexie.maxKey]
        )
        .filter((v) => !v.isRemoved)
        .toArray();

      log("Found versions in cache:", versions.length);
      
      // If no versions in cache but playlist has versions, try to initialize
      if (versions.length === 0 && cached.versions && cached.versions.length > 0) {
        log("No cached versions found, initializing playlist:", id);
        await this.initializePlaylist(id, cached);
        // Try getting versions again
        const freshVersions = await db.versions
          .where('[playlistId+id]')
          .between(
            [id, Dexie.minKey],
            [id, Dexie.maxKey]
          )
          .filter((v) => !v.isRemoved)
          .toArray();
          
        return {
          ...cached,
          versions: freshVersions,
        };
      }

      return {
        ...cached,
        versions,
      };
    } catch (error) {
      console.error("Error getting playlist:", error);
      return undefined;
    }
  }

  async getDraftContent(
    versionId: string,
    playlistId: string,
  ): Promise<{ content?: string; labelId?: string }> {
    try {
      const version = await db.versions
        .where('[playlistId+id]')
        .equals([playlistId, versionId])
        .first();
      return {
        content: version?.draftContent,
        labelId: version?.labelId,
      };
    } catch (error) {
      console.error("Failed to get draft content:", error);
      return {};
    }
  }

  async saveDraft(
    versionId: string,
    playlistId: string,
    content: string,
    labelId: string = "",
  ): Promise<void> {
    try {
      // First, get the version from the current playlist
      const version = await db.versions.get([playlistId, versionId]);

      if (version) {
        // Update existing version in this playlist
        const updatedVersion = {
          ...version,
          draftContent: content,
          labelId,
          lastModified: Date.now(),
        };
        
        await db.versions.put(updatedVersion, [playlistId, versionId]);
      } else {
        // Get the playlist to find the base version
        const playlist = await this.getPlaylist(playlistId);
        
        if (!playlist?.versions) {
          console.error("Cannot save draft: Playlist not found or has no versions", playlistId);
          return;
        }

        // For Quick Notes, create a new version if it doesn't exist
        let baseVersion = playlist.versions.find((v: FtrackVersion) => v.id === versionId);
        if (!baseVersion && playlistId === 'quick-notes') {
          baseVersion = {
            id: versionId,
            version: 1,
            name: content.substring(0, 50) || 'New Note',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            thumbnailUrl: '',
            reviewSessionObjectId: '',
          };
          playlist.versions = [...(playlist.versions || []), baseVersion];
          await db.playlists.put(playlist);
        } else if (!baseVersion) {
          console.error("Cannot save draft: Version not found in playlist", versionId);
          return;
        }

        // Create a new version entry specific to this playlist
        const newVersion: CachedVersion = {
          ...baseVersion,
          playlistId,
          draftContent: content,
          labelId,
          lastModified: Date.now(),
          isRemoved: false,
        };
        
        await db.versions.put(newVersion, [playlistId, versionId]);
      }
    } catch (error) {
      console.error("Failed to save draft:", error);
      throw error;
    }
  }

  async cachePlaylist(playlist: Playlist): Promise<void> {
    try {
      const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);
      await db.playlists.put(cleanedPlaylist);

      // Get current versions to preserve draft content
      const existingVersions = await db.versions
        .where('playlistId')
        .equals(playlist.id)
        .toArray();

      const draftMap = new Map(
        existingVersions.map((v) => [v.id, v.draftContent]),
      );

      const labelIdMap = new Map(
        existingVersions.map((v) => [v.id, v.labelId]),
      );

      // Cache versions, preserving draft content for existing versions
      if (playlist.versions) {
        // Don't clear Quick Notes versions when caching
        if (playlist.id === 'quick-notes') {
          const existingIds = new Set(existingVersions.map(v => v.id));
          const newVersions = playlist.versions.filter(v => !existingIds.has(v.id));
          
          // Only process new versions
          await Promise.all(
            newVersions.map(async (version) => {
              const versionToSave: CachedVersion = {
                ...version,
                playlistId: playlist.id,
                draftContent: "",
                labelId: "",
                lastModified: Date.now(),
                isRemoved: false,
              };

              await db.versions.put(versionToSave, [playlist.id, version.id]);
            })
          );
        } else {
          // Process each version individually for non-Quick Notes playlists
          await Promise.all(
            playlist.versions.map(async (version) => {
              const existingDraft = draftMap.get(version.id);
              const existingLabelId = labelIdMap.get(version.id);

              const versionToSave: CachedVersion = {
                ...version,
                playlistId: playlist.id,
                draftContent: existingDraft || "",
                labelId: existingLabelId || "",
                lastModified: Date.now(),
                isRemoved: false,
              };

              await db.versions.put(versionToSave, [playlist.id, version.id]);
            })
          );

          // Remove versions that are no longer in the playlist
          const currentVersionIds = new Set(playlist.versions.map((v) => v.id));
          const versionsToRemove = await db.versions
            .where('playlistId')
            .equals(playlist.id)
            .filter((v) => !currentVersionIds.has(v.id))
            .toArray();
          
          if (versionsToRemove.length > 0) {
            await Promise.all(
              versionsToRemove.map(v => 
                db.versions.delete([playlist.id, v.id])
              )
            );
          }
        }
      }
    } catch (err) {
      console.error("Error in cachePlaylist:", err);
      throw err;
    }
  }

  async initializePlaylist(playlistId: string, playlist: Playlist) {
    try {
      // Get fresh versions from Ftrack
      const freshVersions = await this.ftrackService.getPlaylistVersions(playlistId);
      
      if (freshVersions) {
        // Cache the playlist with fresh versions
        await this.cachePlaylist({
          ...playlist,
          versions: freshVersions,
        });
      } else {
        // If no fresh versions, cache with existing versions
        await this.cachePlaylist(playlist);
      }
    } catch (error) {
      console.error("Error initializing playlist:", error);
    }
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

  private compareVersions(v1: FtrackVersion, v2: FtrackVersion): boolean {
    // Only compare fields that should trigger a version change
    return (
      v1.id === v2.id &&
      v1.version === v2.version &&
      v1.name === v2.name &&
      v1.reviewSessionObjectId === v2.reviewSessionObjectId
    );
  }

  async pollForChanges(
    playlist: Playlist,
    onModificationsFound: (
      addedCount: number,
      removedCount: number,
      versions: FtrackVersion[],
    ) => void,
  ): Promise<void> {
    try {
      // Get fresh versions for the current playlist
      const freshVersions = await this.ftrackService.getPlaylistVersions(
        playlist.id,
      );

      if (!freshVersions) {
        return;
      }

      // Get current cached playlist
      const cachedPlaylist = await this.getPlaylist(playlist.id);
      if (!cachedPlaylist?.versions) {
        // If no cached versions, treat all as new
        await this.cachePlaylist({ ...playlist, versions: freshVersions });
        onModificationsFound(freshVersions.length, 0, freshVersions);
        return;
      }

      // Create maps for efficient lookup
      const cachedVersionMap = new Map(
        cachedPlaylist.versions.map(v => [v.id, v])
      );
      const freshVersionMap = new Map(
        freshVersions.map(v => [v.id, v])
      );

      // Find truly added and removed versions by comparing relevant fields
      const addedVersions = freshVersions.filter(v => {
        const cached = cachedVersionMap.get(v.id);
        return !cached || !this.compareVersions(v, cached);
      });

      const removedVersions = cachedPlaylist.versions.filter(v => {
        const fresh = freshVersionMap.get(v.id);
        return !fresh || !this.compareVersions(fresh, v);
      });

      if (addedVersions.length > 0 || removedVersions.length > 0) {
        // Update the cache with new versions
        await this.cachePlaylist({ ...playlist, versions: freshVersions });
        onModificationsFound(
          addedVersions.length,
          removedVersions.length,
          freshVersions,
        );
      }
    } catch (error) {
      console.error("Error polling for changes:", error);
    }
  }
}

export const playlistStore = new PlaylistStore(new FtrackService());
