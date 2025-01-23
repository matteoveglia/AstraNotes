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

interface CachedVersion extends AssetVersion {
  playlistId: string;
  isRemoved?: boolean;
  lastChecked?: number;
  lastModified: number;
  draftContent?: string;
}

export class PlaylistStore {
  private static POLL_INTERVAL = 5000; // 5 seconds
  private pollingInterval: NodeJS.Timeout | null = null;

  private cleanPlaylistForStorage(playlist: Playlist): CachedPlaylist {
    // Create a new object with only serializable properties
    const cleanPlaylist = {
      ...playlist,
      versions: playlist.versions?.map(v => ({
        id: v.id,
        name: v.name,
        version: v.version,
        reviewSessionObjectId: v.reviewSessionObjectId,
        thumbnailUrl: v.thumbnailUrl,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt
      })) || [],
      notes: playlist.notes?.map(n => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        createdById: n.createdById,
        author: n.author,
        frameNumber: n.frameNumber
      })) || [],
      lastAccessed: Date.now(),
      lastChecked: Date.now(),
      hasModifications: false,
      addedVersions: [],
      removedVersions: []
    };

    // Remove any non-serializable properties
    delete (cleanPlaylist as any).onModificationsFound;
    
    return cleanPlaylist;
  }

  private cleanVersionForStorage(version: AssetVersion & { playlistId: string }): CachedVersion {
    // Create a clean copy without any functions or non-serializable data
    const { 
      id, 
      name, 
      version: versionNumber, 
      reviewSessionObjectId, 
      thumbnailUrl,
      playlistId,
      createdAt,
      updatedAt
    } = version;

    return {
      id,
      name,
      version: versionNumber,
      reviewSessionObjectId,
      thumbnailUrl,
      playlistId,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
      lastChecked: Date.now(),
      isRemoved: false,
      lastModified: Date.now(),
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
    await db.playlists.put(cleanedPlaylist);

    // Cache versions
    if (playlist.versions) {
      await Promise.all(
        playlist.versions.map((version) =>
          db.versions.put(
            this.cleanVersionForStorage({
              ...version,
              playlistId: playlist.id,
            })
          )
        )
      );
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
      removedVersions?: string[]
    ) => void
  ) {
    log('Starting polling for playlist:', playlistId);
    this.stopPolling();

    // Don't start polling if auto-refresh is disabled
    const settings = JSON.parse(localStorage.getItem('settings-storage') || '{}');
    if (!settings?.state?.settings?.autoRefreshEnabled) {
      log('Auto-refresh is disabled, not starting polling');
      return;
    }

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
        
        // Compare with cached versions
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
            removedVersions
          );
        }

        // Update cache with fresh versions
        const updatedPlaylist = {
          ...cached,
          versions: freshVersions,
          lastChecked: Date.now()
        };
        await this.cachePlaylist(updatedPlaylist);
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
