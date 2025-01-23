import { ftrackService } from '../services/ftrack';
import { db } from './db';
import { Playlist, AssetVersion } from '../types';

const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) {
    console.log('[PlaylistStore]', ...args);
  }
};

interface CachedPlaylist extends Playlist {
  lastAccessed: number;
  lastChecked: number;
  hasModifications: boolean;
  addedVersions: string[];
  removedVersions: string[];
}

interface StorableVersion extends AssetVersion {
  playlistId: string;
  lastModified: number;
  draftContent?: string;
}

interface CachedVersion extends StorableVersion {
  isRemoved?: boolean;
  lastChecked?: number;
}

export class PlaylistStore {
  private static POLL_INTERVAL = 5000; // 5 seconds
  private pollingInterval: NodeJS.Timeout | null = null;

  private findNonSerializableProps(obj: any, path = ''): string[] {
    const nonSerializable: string[] = [];
    
    if (!obj || typeof obj !== 'object') return nonSerializable;
    
    for (const key in obj) {
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'function') {
        nonSerializable.push(`Function at ${currentPath}: ${value.toString().slice(0, 100)}...`);
      } else if (typeof value === 'object' && value !== null) {
        if (value instanceof Date) continue; // Dates are fine
        if (Array.isArray(value)) {
          // Check array items
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              nonSerializable.push(...this.findNonSerializableProps(item, `${currentPath}[${index}]`));
            } else if (typeof item === 'function') {
              nonSerializable.push(`Function in array at ${currentPath}[${index}]: ${item.toString().slice(0, 100)}...`);
            }
          });
        } else {
          nonSerializable.push(...this.findNonSerializableProps(value, currentPath));
        }
      }
    }
    
    return nonSerializable;
  }

  private cleanDate(date: any): string {
    // If it's a Moment object (has format function), convert to ISO string
    if (date && typeof date.format === 'function') {
      return date.format();
    }
    // If it's already a string, return as is
    if (typeof date === 'string') {
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
      versions: playlist.versions?.map(v => ({
        id: v.id,
        name: v.name,
        version: v.version,
        reviewSessionObjectId: v.reviewSessionObjectId,
        thumbnailUrl: v.thumbnailUrl,
        createdAt: this.cleanDate(v.createdAt),
        updatedAt: this.cleanDate(v.updatedAt)
      })),
      notes: (playlist.notes || []).map(n => ({
        id: n.id,
        content: n.content,
        createdAt: this.cleanDate(n.createdAt),
        updatedAt: this.cleanDate(n.updatedAt),
        createdById: n.createdById,
        author: n.author
      })),
      lastAccessed: Date.now(),
      lastChecked: Date.now(),
      hasModifications: false,
      addedVersions: [],
      removedVersions: []
    };

    return cleanPlaylist;
  }

  private cleanVersionForStorage(version: AssetVersion & { playlistId: string }): StorableVersion {
    // Create a new object with only serializable properties
    return {
      id: version.id,
      name: version.name,
      version: version.version,
      reviewSessionObjectId: version.reviewSessionObjectId,
      thumbnailUrl: version.thumbnailUrl,
      createdAt: this.cleanDate(version.createdAt),
      updatedAt: this.cleanDate(version.updatedAt),
      playlistId: version.playlistId,
      lastModified: Date.now()
    };
  }

  private cleanVersion(version: AssetVersion): AssetVersion {
    return {
      id: version.id,
      name: version.name,
      version: version.version,
      reviewSessionObjectId: version.reviewSessionObjectId,
      thumbnailUrl: version.thumbnailUrl,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt
    };
  }

  async getPlaylist(id: string): Promise<CachedPlaylist | undefined> {
    log('Getting playlist from cache:', id);
    const cached = await db.playlists.get(id);
    if (!cached) return undefined;

    // Get all versions for this playlist
    const versions = await db.versions
      .where('playlistId')
      .equals(id)
      .filter(v => !v.isRemoved)
      .toArray();

    log('Found versions in cache:', versions.length);
    return {
      ...cached,
      versions
    };
  }

  async getDraftContent(versionId: string): Promise<string | undefined> {
    log('Getting draft content for version:', versionId);
    const version = await db.versions.get(versionId);
    return version?.draftContent;
  }

  async saveDraft(versionId: string, content: string): Promise<void> {
    log('Saving draft for version:', versionId);
    const version = await db.versions.get(versionId);
    if (version) {
      await db.versions.update(versionId, {
        ...version,
        draftContent: content,
        lastModified: Date.now()
      });
    }
  }

  async cachePlaylist(playlist: Playlist): Promise<void> {
    try {
      log('Caching playlist:', playlist.id);
      const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);
      
      // Only log if we still have non-serializable properties after cleaning
      if (process.env.NODE_ENV === 'development') {
        const nonSerializable = this.findNonSerializableProps(cleanedPlaylist);
        if (nonSerializable.length > 0) {
          log('Warning: Found non-serializable properties after cleaning:', nonSerializable);
        }
      }

      // Update the playlist in the cache
      await db.playlists.put(cleanedPlaylist).catch(err => {
        // If we can't cache the playlist but everything else works, that's okay
        log('Warning: Failed to cache playlist:', err);
      });

      // Get current versions to preserve draft content
      const existingVersions = await db.versions
        .where('playlistId')
        .equals(playlist.id)
        .toArray();

      const draftMap = new Map(
        existingVersions.map(v => [v.id, (v as CachedVersion).draftContent])
      );

      // Cache versions, preserving draft content for existing versions
      if (playlist.versions) {
        await Promise.all(
          playlist.versions.map(async (version) => {
            try {
              const cleanVersion = this.cleanVersionForStorage({
                ...version,
                playlistId: playlist.id,
              });

              // Add draft content if it exists
              const existingDraft = draftMap.get(version.id);
              if (existingDraft) {
                await db.versions.put({
                  ...cleanVersion,
                  draftContent: existingDraft
                } as CachedVersion);
              } else {
                await db.versions.put(cleanVersion);
              }
            } catch (err) {
              // If we can't cache a version but everything else works, that's okay
              log('Warning: Failed to cache version:', version.id, err);
            }
          })
        );

        // Remove versions that are no longer in the playlist
        const currentVersionIds = new Set(playlist.versions.map(v => v.id));
        const versionsToRemove = existingVersions
          .filter(v => !currentVersionIds.has(v.id))
          .map(v => v.id);

        if (versionsToRemove.length > 0) {
          await db.versions.bulkDelete(versionsToRemove).catch(err => {
            // If we can't delete old versions but everything else works, that's okay
            log('Warning: Failed to delete old versions:', err);
          });
        }
      }
    } catch (err) {
      // Log the error but don't throw since the UI functionality still works
      log('Warning: Error in cachePlaylist but UI should still work:', err);
    }
  }

  async initializePlaylist(playlistId: string, playlist: Playlist) {
    // Cache the playlist first to ensure we have the latest state
    await this.cachePlaylist(playlist);
    
    // Try to restore any existing drafts
    const versions = playlist.versions || [];
    await Promise.all(versions.map(async (version) => {
      const draftContent = await this.getDraftContent(version.id);
      if (draftContent) {
        await this.saveDraft(version.id, draftContent);
      }
    }));
  }

  async updatePlaylist(playlistId: string): Promise<void> {
    log('Updating playlist with fresh data:', playlistId);
    const fresh = await ftrackService.getPlaylists();
    const freshPlaylist = fresh.find(p => p.id === playlistId);
    if (!freshPlaylist) {
      log('No playlist found with id:', playlistId);
      return;
    }

    // Get current cached versions before updating
    const cached = await this.getPlaylist(playlistId);
    const cachedVersionIds = new Set((cached?.versions || []).map(v => v.id));
    const freshVersionIds = new Set((freshPlaylist.versions || []).map(v => v.id));

    // Check for modifications
    const addedVersions = (freshPlaylist.versions || [])
      .filter(v => !cachedVersionIds.has(v.id))
      .map(v => v.id);

    const removedVersions = (cached?.versions || [])
      .filter(v => !freshVersionIds.has(v.id))
      .map(v => v.id);

    if (addedVersions.length > 0 || removedVersions.length > 0) {
      log('Found modifications:', { 
        playlistId,
        added: addedVersions.length, 
        removed: removedVersions.length,
        addedVersions,
        removedVersions
      });
    }

    // Update cache with fresh data
    await this.cachePlaylist(freshPlaylist);
  }

  async startPolling(
    playlistId: string, 
    onModificationsFound: (
      added: number, 
      removed: number, 
      addedVersions?: string[],
      removedVersions?: string[],
      freshVersions?: AssetVersion[]
    ) => void
  ) {
    log('Starting polling for playlist:', playlistId);
    this.stopPolling();

    // Set a small delay before starting the first poll to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 1000));

    const poll = async () => {
      log('Polling for changes on playlist:', playlistId);
      const cached = await this.getPlaylist(playlistId);
      if (!cached) {
        log('No cached playlist found:', playlistId);
        return;
      }

      try {
        // Get fresh versions for the current playlist
        const freshVersions = await ftrackService.getPlaylistVersions(playlistId);
        
        // Compare with cached versions using a Set for O(1) lookups
        const cachedVersionIds = new Set((cached.versions || []).map(v => v.id));
        const freshVersionIds = new Set(freshVersions.map(v => v.id));

        // Deep compare versions to avoid false positives
        const addedVersions = freshVersions
          .filter(v => !cachedVersionIds.has(v.id))
          .map(v => v.id);

        const removedVersions = (cached.versions || [])
          .filter(v => !freshVersionIds.has(v.id))
          .map(v => v.id);

        // Only notify if there are actual changes
        if (addedVersions.length > 0 || removedVersions.length > 0) {
          log('Found modifications:', { 
            playlistId,
            added: addedVersions.length, 
            removed: removedVersions.length,
            addedVersions,
            removedVersions
          });

          // Clean versions before passing to callback
          const cleanVersions = freshVersions.map(v => this.cleanVersion(v));

          onModificationsFound(
            addedVersions.length,
            removedVersions.length,
            addedVersions,
            removedVersions,
            cleanVersions
          );
        }
      } catch (error) {
        log('Error polling for changes:', error);
      }
    };

    // Run the first poll
    await poll();

    // Start the polling interval
    this.pollingInterval = setInterval(poll, PlaylistStore.POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollingInterval) {
      log('Stopping polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

export const playlistStore = new PlaylistStore();
