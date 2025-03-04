/**
 * @fileoverview playlistStore.ts
 * Individual playlist state and cache management.
 * Handles:
 * - Version tracking and updates
 * - Draft content persistence
 * - Playlist synchronization
 * - Change detection and polling
 */

import { db } from "./db";
import { Playlist, AssetVersion } from "../types";
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
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
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
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  createdAt: string;
  updatedAt: string;
  manuallyAdded?: boolean;
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
          typeof value === 'string' || 
          typeof value === 'number' || 
          typeof value === 'boolean'
        ) {
          // Primitive values can be directly assigned
          (result as any)[key] = value;
        } else if (typeof value === 'object') {
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

      // For Quick Notes, preserve all versions from IndexedDB that are manually added
      if (id === "quick-notes") {
        // For Quick Notes, only include manually added versions from the database
        const manuallyAddedVersions = dbVersions.filter(v => v.manuallyAdded);
        
        // Create a set of version IDs that are in the addedVersions array
        const addedVersionsSet = new Set(cached.addedVersions || []);
        
        // Only include versions that are both manually added and in the addedVersions array
        // This ensures that cleared versions don't reappear
        const filteredVersions = manuallyAddedVersions.filter(v => 
          addedVersionsSet.has(v.id) || !cached.removedVersions.includes(v.id)
        );
        
        cached.versions = filteredVersions;
      } else {
        // For other playlists:
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
            })) || []),
        ];

        // Sort versions by name and version number
        cached.versions = mergedVersions.sort((a, b) => {
          const nameCompare = a.name.localeCompare(b.name);
          if (nameCompare !== 0) return nameCompare;
          return (b.version || 0) - (a.version || 0);
        });
      }

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
        await db.versions.put(updatedVersion);
        log(`Updated draft for version ${versionId} in playlist ${playlistId}`);
      } else {
        // Version not found in this playlist
        // Check if the version exists in the playlist object
        const playlist = await this.getPlaylist(playlistId);
        if (!playlist) {
          throw new Error(`Playlist not found: ${playlistId}`);
        }

        // Find the version in the playlist's versions array
        const versionInPlaylist = playlist.versions?.find((v) => v.id === versionId);
        
        if (!versionInPlaylist) {
          // For Quick Notes, we need to handle the case where the version might not be in the playlist yet
          if (playlistId === "quick-notes") {
            // Check if the version exists in any other playlist
            const existingVersion = await db.versions
              .where("id")
              .equals(versionId)
              .first();
              
            if (existingVersion) {
              // Create a new version entry for Quick Notes based on the existing version
              const newVersion: CachedVersion = {
                ...existingVersion,
                playlistId,
                draftContent: content,
                labelId,
                lastModified: Date.now(),
                manuallyAdded: true,
              };
              
              // Add it to the database
              await db.versions.put(newVersion);
              
              // Update the playlist's addedVersions array
              if (!playlist.addedVersions.includes(versionId)) {
                playlist.addedVersions = [...playlist.addedVersions, versionId];
                playlist.hasModifications = true;
                await this.cachePlaylist(playlist);
              }
              
              log(`Created new draft for version ${versionId} in Quick Notes based on existing version`);
              return;
            } else {
              console.error(`Cannot save draft: Version not found in any playlist – "${versionId}"`);
              return;
            }
          } else {
            console.error(`Cannot save draft: Version not found in playlist – "${versionId}"`);
            return;
          }
        }

        // Create a new version entry for this playlist
        const newVersion: CachedVersion = {
          ...versionInPlaylist,
          playlistId,
          draftContent: content,
          labelId,
          lastModified: Date.now(),
          // Preserve manuallyAdded flag if it exists
          manuallyAdded: versionInPlaylist.manuallyAdded || false,
        };
        await db.versions.put(newVersion);
        
        // If this is a manually added version, update the playlist's addedVersions array
        if (newVersion.manuallyAdded && !playlist.addedVersions.includes(versionId)) {
          playlist.addedVersions = [...playlist.addedVersions, versionId];
          playlist.hasModifications = true;
          await this.cachePlaylist(playlist);
        }
        
        log(`Created new draft for version ${versionId} in playlist ${playlistId}`);
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
        .where("playlistId")
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
        if (playlist.id === "quick-notes") {
          const existingIds = new Set(existingVersions.map((v) => v.id));
          const newVersions = playlist.versions.filter(
            (v) => !existingIds.has(v.id),
          );

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
                manuallyAdded: version.manuallyAdded || false,
              };

              await db.versions.put(versionToSave, [playlist.id, version.id]);
            }),
          );
        } else {
          // Process each version individually for non-Quick Notes playlists
          await Promise.all(
            playlist.versions.map(async (version) => {
              const existingDraft = draftMap.get(version.id);
              const existingLabelId = labelIdMap.get(version.id);
              const existingVersion = existingVersions.find(
                (v) => v.id === version.id,
              );

              const versionToSave: CachedVersion = {
                ...version,
                playlistId: playlist.id,
                draftContent: existingDraft || "",
                labelId: existingLabelId || "",
                lastModified: Date.now(),
                isRemoved: false,
                // Preserve manuallyAdded flag from existing version or from the version itself
                manuallyAdded:
                  existingVersion?.manuallyAdded ||
                  version.manuallyAdded ||
                  false,
              };

              await db.versions.put(versionToSave, [playlist.id, version.id]);
            }),
          );
        }
      }

      // Cache the playlist itself
      await db.playlists.put(playlist);
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
                isRemoved: false,
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
      console.log(`Already polling for playlist ${playlistId}, skipping duplicate poll`);
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

  async pollForChanges(playlistId: string) {
    try {
      const freshVersions =
        await this.ftrackService.getPlaylistVersions(playlistId);
      const playlist = await this.getPlaylist(playlistId);

      if (!playlist || !freshVersions) return;

      // Create a clean version of the playlist with fresh versions
      const cleanedPlaylist = this.cleanPlaylistForStorage({
        ...playlist,
        versions: freshVersions,
      });

      await this.cachePlaylist(cleanedPlaylist);
    } catch (error) {
      console.error("Error polling for changes:", error);
    }
  }

  async addVersionToPlaylist(
    playlistId: string,
    version: AssetVersion
  ): Promise<void> {
    // If a version add is already in progress, wait a moment
    if (this.versionAddInProgress) {
      log(`Version add already in progress, waiting before adding ${version.id} to playlist ${playlistId}`);
      await new Promise(resolve => setTimeout(resolve, 500));
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
      const versionExists = playlist.versions?.some(v => v.id === version.id);
      if (versionExists) {
        log(`Version ${version.id} already exists in playlist ${playlistId}, skipping`);
        return;
      }
      
      // Check if the version already exists in the database
      const existingVersion = await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, version.id])
        .first();
        
      if (existingVersion) {
        log(`Version ${version.id} already exists in database for playlist ${playlistId}, skipping`);
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
      const thumbnailId = version.thumbnailId ? String(version.thumbnailId) : null;
      const reviewSessionObjectId = version.reviewSessionObjectId ? 
        String(version.reviewSessionObjectId) : null;

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
        updatedAt: updatedAt
      };
      
      // Only add additional properties if they're not null
      if (thumbnailId) {
        minimalVersion['thumbnailId'] = thumbnailId;
      }
      
      if (reviewSessionObjectId) {
        minimalVersion['reviewSessionObjectId'] = reviewSessionObjectId;
      }
      
      // Convert to string first to avoid any potential serialization issues
      try {
        log(`Adding minimal version to database: ${
          JSON.stringify({
            id: minimalVersion.id,
            name: minimalVersion.name,
            version: minimalVersion.version,
            // Include other non-complex properties
          })
        }`);
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
      console.error(`Failed to add version ${version.id} to playlist ${playlistId}:`, error);
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
      
      log(`Found ${manuallyAddedVersions.length} manually added versions to clear for playlist ${playlistId}`);

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
        const versionIds = manuallyAddedVersions.map(v => v.id);
        
        // Delete any drafts for these versions
        for (const versionId of versionIds) {
          try {
            await db.versions
              .where("[playlistId+id]")
              .equals([playlistId, versionId])
              .delete();
          } catch (err) {
            console.error(`Failed to delete draft for version ${versionId}:`, err);
          }
        }
      }

      // Update the cached playlist to reflect the changes
      const cachedPlaylist = await this.getPlaylist(playlistId);
      if (cachedPlaylist) {
        // Filter out manually added versions from the playlist
        if (cachedPlaylist.versions) {
          cachedPlaylist.versions = cachedPlaylist.versions.filter(
            (v) => !v.manuallyAdded
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
        
        log(`Cleared ${manuallyAddedVersions.length} manually added versions from playlist ${playlistId}`);
      } else {
        log(`Warning: Could not find cached playlist ${playlistId} to update after clearing versions`);
      }
    } catch (error) {
      console.error("Failed to clear manually added versions:", error);
      throw error;
    }
  }
}

export const playlistStore = new PlaylistStore(new FtrackService());
