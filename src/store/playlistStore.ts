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

  private cleanPlaylistForStorage(playlist: Playlist): CachedPlaylist {
    // Create a new object with only serializable properties
    const cleanPlaylist = {
      id: playlist.id,
      name: playlist.name,
      title: playlist.title,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      isQuickNotes: playlist.isQuickNotes,
      lastAccessed: Date.now(),
      lastChecked: Date.now(),
      hasModifications: false,
      addedVersions: [],
      removedVersions: [],
      notes: (playlist.notes || []).map(n => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        createdById: n.createdById,
        author: n.author
      }))
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
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      playlistId: version.playlistId,
      lastModified: Date.now()
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
    log('Caching playlist:', playlist.id);
    const cleanedPlaylist = this.cleanPlaylistForStorage(playlist);

    // Update the playlist in the cache
    await db.playlists.put(cleanedPlaylist);

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
        })
      );

      // Remove versions that are no longer in the playlist
      const currentVersionIds = new Set(playlist.versions.map(v => v.id));
      const versionsToRemove = existingVersions
        .filter(v => !currentVersionIds.has(v.id))
        .map(v => v.id);

      if (versionsToRemove.length > 0) {
        await db.versions.bulkDelete(versionsToRemove);
      }
    }
  }

  async initializePlaylist(playlistId: string, playlist: Playlist) {
    // Try to load from cache first
    const cached = await this.getPlaylist(playlistId);
    if (cached) {
      // Restore drafts and statuses
      const versions = cached.versions || [];
      await Promise.all(versions.map(async (version) => {
        const draftContent = await this.getDraftContent(version.id);
        if (draftContent) {
          await this.saveDraft(version.id, draftContent);
        }
      }));
    } else {
      // Cache the playlist if not found
      await this.cachePlaylist(playlist);
    }
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

    this.pollingInterval = setInterval(async () => {
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

        const addedVersions = freshVersions
          .filter(v => !cachedVersionIds.has(v.id))
          .map(v => v.id);

        const removedVersions = (cached.versions || [])
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

          onModificationsFound(
            addedVersions.length,
            removedVersions.length,
            addedVersions,
            removedVersions,
            freshVersions
          );
        }
      } catch (error) {
        log('Error polling for changes:', error);
      }
    }, PlaylistStore.POLL_INTERVAL);
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
