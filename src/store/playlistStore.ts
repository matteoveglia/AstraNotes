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

  private cleanDate(date: string | Date | undefined): string {
    if (!date) return new Date().toISOString();
    return typeof date === 'string' ? date : date.toISOString();
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
        reviewSessionObjectId: v.reviewSessionObjectId || '',
        thumbnailUrl: v.thumbnailUrl || '',
        createdAt: this.cleanDate(v.createdAt),
        updatedAt: this.cleanDate(v.updatedAt),
      })),
      notes: (playlist.notes || []).map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: this.cleanDate(n.createdAt),
        updatedAt: this.cleanDate(n.updatedAt),
        createdById: n.createdById || '',
        author: n.author || '',
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
      // Get the playlist from cache
      const cached = await db.playlists.get(id);
      
      // Get versions for this playlist
      const versions = await db.versions
        .where('playlistId')
        .equals(id)
        .filter(v => !v.isRemoved)
        .toArray();
      
      // If no versions in cache but playlist has versions, try to initialize
      if (versions.length === 0 && cached?.versions && cached.versions.length > 0) {
        await this.initializePlaylist(id, cached);
        // Try getting versions again
        return this.getPlaylist(id);
      }

      if (!cached) {
        return null;
      }

      // For Quick Notes, preserve existing versions and merge with cached
      if (id === 'quick-notes' && cached.versions) {
        const existingIds = new Set(versions.map(v => v.id));
        const newVersions = cached.versions.filter(v => !existingIds.has(v.id));
        
        // Merge existing versions with new ones
        cached.versions = [...versions, ...newVersions];
      } else {
        // For other playlists, use cached versions but preserve draft content
        cached.versions = cached.versions?.map(v => {
          const existingVersion = versions.find(ev => ev.id === v.id);
          if (existingVersion) {
            return {
              ...v,
              draftContent: existingVersion.draftContent,
              labelId: existingVersion.labelId
            };
          }
          return v;
        });
      }

      return cached;
    } catch (error) {
      console.error("Error getting playlist:", error);
      throw error;
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

  async cachePlaylist(playlist: CachedPlaylist): Promise<void> {
    try {
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

      // Cache the playlist itself
      await db.playlists.put(playlist);
    } catch (err) {
      console.error("Error in cachePlaylist:", err);
      throw err;
    }
  }

  async initializePlaylist(playlistId: string, playlist: Playlist): Promise<void> {
    try {
      const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);
      
      // Special handling for Quick Notes
      if (playlistId === 'quick-notes') {
        const existingVersions = await db.versions
          .where('playlistId')
          .equals(playlistId)
          .toArray();
          
        // Only cache new versions, preserve existing ones
        if (existingVersions.length > 0) {
          const existingIds = new Set(existingVersions.map(v => v.id));
          cleanedPlaylist.versions = playlist.versions?.filter(v => !existingIds.has(v.id)) || [];
        }
      }
      
      await this.cachePlaylist(cleanedPlaylist);
    } catch (error) {
      console.error("Error initializing playlist:", error);
      throw error;
    }
  }

  async initializeQuickNotes(): Promise<void> {
    const quickNotes = await this.getPlaylist('quick-notes');
    if (!quickNotes) {
      const cleanedPlaylist = this.cleanPlaylistForStorage({
        id: 'quick-notes',
        name: 'Quick Notes',
        title: 'Quick Notes',
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
    log("Updating playlist with fresh data:", playlistId);
    const fresh = await this.ftrackService.getPlaylists();
    
    if (!fresh) {
      log("No playlists found");
      return;
    }

    const playlist = fresh.find((p) => p.id === playlistId);
    if (!playlist) {
      log("Playlist not found:", playlistId);
      return;
    }

    const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);
    await this.cachePlaylist(cleanedPlaylist);
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

  async pollForChanges(playlistId: string) {
    try {
      const freshVersions = await this.ftrackService.getPlaylistVersions(playlistId);
      const playlist = await this.getPlaylist(playlistId);
      
      if (!playlist || !freshVersions) return;
      
      // Create a clean version of the playlist with fresh versions
      const cleanedPlaylist = this.cleanPlaylistForStorage({
        ...playlist,
        versions: freshVersions
      });
      
      await this.cachePlaylist(cleanedPlaylist);
    } catch (error) {
      console.error("Error polling for changes:", error);
    }
  }
}

export const playlistStore = new PlaylistStore(new FtrackService());
