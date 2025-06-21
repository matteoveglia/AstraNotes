/**
 * @fileoverview PlaylistSync.ts
 * Handles synchronization between local playlists and ftrack using stable UUIDs.
 * NO ID CHANGES - playlists keep their stable UUIDs throughout sync.
 * This ensures no UI remounting or data loss.
 */

// Simple browser-compatible event emitter
class SimpleEventEmitter {
  private listeners: Record<string, Function[]> = {};
  
  on(event: string, listener: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }
  
  off(event: string, listener: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
  }
  
  emit(event: string, data?: any): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`[EventEmitter] Error in listener for ${event}:`, error);
      }
    });
  }
  
  removeAllListeners(): void {
    this.listeners = {};
  }
}

import { PlaylistRepository } from './PlaylistRepository';
import { PlaylistCache } from './PlaylistCache';
import { FtrackService } from '@/services/ftrack';
import { PlaylistEntity, SyncOperations, PlaylistEvent, SyncProgress } from './types';
import { CreatePlaylistRequest } from '@/types';

export class PlaylistSync extends SimpleEventEmitter implements SyncOperations {
  private activeSyncs = new Set<string>();
  
  constructor(
    private repository: PlaylistRepository,
    private cache: PlaylistCache,
    private ftrackService: FtrackService
  ) {
    super();
    console.log('[PlaylistSync] Initialized with stable UUID architecture');
  }
  
  // =================== SYNC OPERATIONS ===================
  
  /**
   * Syncs a playlist to ftrack WITHOUT changing its ID.
   * The playlist keeps its stable UUID, we just add ftrack metadata.
   * This prevents any UI disruption or data loss.
   */
  async syncPlaylist(playlistId: string): Promise<void> {
    console.log(`[PlaylistSync] Starting sync for playlist: ${playlistId}`);
    
    // Prevent duplicate syncs
    if (this.activeSyncs.has(playlistId)) {
      console.log(`[PlaylistSync] Sync already in progress for: ${playlistId}`);
      return;
    }
    
    this.activeSyncs.add(playlistId);
    
    try {
      // 1. Get the playlist entity
      const playlist = await this.repository.getPlaylist(playlistId);
      if (!playlist) {
        throw new Error(`Playlist ${playlistId} not found`);
      }
      
      // 2. Check if already synced
      if (playlist.ftrackSyncStatus === 'synced' && playlist.ftrackId) {
        console.log(`[PlaylistSync] Playlist ${playlistId} already synced to ftrack: ${playlist.ftrackId}`);
        this.activeSyncs.delete(playlistId);
        return;
      }
      
      // 3. Update status to syncing
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: 'syncing',
      });
      
      this.emit('sync-started', { 
        type: 'sync-started', 
        playlistId,
        data: { progress: { current: 1, total: 4, step: 'Starting sync' } }
      } as PlaylistEvent);
      
      // 4. Create in ftrack
      const ftrackResponse = await this.createInFtrack(playlist);
      
      this.emit('sync-progress', {
        type: 'sync-started',
        playlistId,
        data: { progress: { current: 2, total: 4, step: 'Created in ftrack' } }
      } as PlaylistEvent);
      
      // 5. Get versions to sync
      const versions = await this.repository.getPlaylistVersions(playlistId);
      
      // 6. Sync versions to ftrack if any exist
      if (versions.length > 0) {
        console.log(`[PlaylistSync] Syncing ${versions.length} versions to ftrack playlist: ${ftrackResponse.id}`);
        
        const versionIds = versions.map(v => v.id);
        const syncResponse = await this.ftrackService.addVersionsToPlaylist(
          ftrackResponse.id,
          versionIds,
          playlist.type
        );
        
        if (!syncResponse.success) {
          throw new Error(syncResponse.error || 'Failed to sync versions to ftrack');
        }
        
        console.log(`[PlaylistSync] Successfully synced ${syncResponse.syncedVersionIds.length} versions`);
      }
      
      this.emit('sync-progress', {
        type: 'sync-started',
        playlistId,
        data: { progress: { current: 3, total: 4, step: 'Synced versions' } }
      } as PlaylistEvent);
      
      // 7. Update playlist with success - SAME ID, just add ftrack metadata
      console.log(`[PlaylistSync] About to update playlist ${playlistId} with ftrackId: ${ftrackResponse.id}`);
      console.log(`[PlaylistSync] Full ftrackResponse:`, ftrackResponse);
      
      await this.repository.updatePlaylist(playlistId, {
        ftrackId: ftrackResponse.id,
        localStatus: 'synced',
        ftrackSyncStatus: 'synced',
        syncedAt: new Date().toISOString(),
      });
      
      // CRITICAL FIX: Update all versions to mark them as no longer manually added
      // After sync, all versions are now part of the official ftrack playlist
      if (versions.length > 0) {
        console.log(`[PlaylistSync] Updating ${versions.length} versions to mark as no longer manually added`);
        for (const version of versions) {
          await this.repository.updateVersion(playlistId, version.id, {
            manuallyAdded: false
          });
        }
        console.log(`[PlaylistSync] Successfully updated version flags for ${versions.length} versions`);
      }
      
      console.log(`[PlaylistSync] Database update completed for playlist ${playlistId}`);
      
      // 8. Clear cache to force fresh load
      this.cache.invalidate(playlistId);
      
      this.emit('sync-completed', {
        type: 'sync-completed',
        playlistId,
        data: { 
          ftrackId: ftrackResponse.id,
          versionsCount: versions.length,
          progress: { current: 4, total: 4, step: 'Completed' }
        }
      } as PlaylistEvent);
      
      console.log(`[PlaylistSync] Successfully synced playlist ${playlistId} to ftrack ${ftrackResponse.id}`);
      
    } catch (error) {
      console.error(`[PlaylistSync] Failed to sync playlist ${playlistId}:`, error);
      
      // Update with error status - still same ID
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: 'failed',
      });
      
      this.emit('sync-failed', {
        type: 'sync-failed',
        playlistId,
        error: error instanceof Error ? error.message : 'Unknown sync error'
      } as PlaylistEvent);
      
      throw error;
    } finally {
      this.activeSyncs.delete(playlistId);
    }
  }
  
  /**
   * Checks the sync status of a playlist
   */
  async checkSyncStatus(playlistId: string): Promise<'not_synced' | 'syncing' | 'synced' | 'failed'> {
    const playlist = await this.repository.getPlaylist(playlistId);
    return playlist?.ftrackSyncStatus || 'not_synced';
  }
  
  /**
   * Gets all playlists that are currently syncing
   */
  getActiveSyncs(): string[] {
    return Array.from(this.activeSyncs);
  }
  
  /**
   * Cancels a sync operation (if possible)
   */
  async cancelSync(playlistId: string): Promise<void> {
    if (this.activeSyncs.has(playlistId)) {
      this.activeSyncs.delete(playlistId);
      
      // Reset sync status
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: 'not_synced',
      });
      
      console.log(`[PlaylistSync] Cancelled sync for playlist: ${playlistId}`);
    }
  }
  
  // =================== PRIVATE METHODS ===================
  
  /**
   * Creates the playlist in ftrack based on its type
   */
  private async createInFtrack(playlist: PlaylistEntity) {
    const createRequest: CreatePlaylistRequest = {
      name: playlist.name,
      type: playlist.type,
      categoryId: playlist.categoryId,
      categoryName: playlist.categoryName,
      description: playlist.description,
      projectId: playlist.projectId,
    };
    
    let response;
    
    if (playlist.type === 'reviewsession') {
      response = await this.ftrackService.createReviewSession(createRequest);
    } else {
      response = await this.ftrackService.createList(createRequest);
    }
    
    if (!response.success) {
      throw new Error(response.error || `Failed to create ${playlist.type} in ftrack`);
    }
    
    console.log(`[PlaylistSync] Created ${playlist.type} in ftrack:`, {
      localId: playlist.id,
      ftrackId: response.id,
      name: playlist.name
    });
    
    return response;
  }
  
  // =================== BULK OPERATIONS ===================
  
  /**
   * Syncs multiple playlists in parallel (with concurrency limit)
   */
  async syncMultiplePlaylists(playlistIds: string[], maxConcurrent = 3): Promise<void> {
    console.log(`[PlaylistSync] Starting bulk sync of ${playlistIds.length} playlists`);
    
    // Process in batches to avoid overwhelming ftrack
    const batches = [];
    for (let i = 0; i < playlistIds.length; i += maxConcurrent) {
      batches.push(playlistIds.slice(i, i + maxConcurrent));
    }
    
    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(id => this.syncPlaylist(id))
      );
    }
    
    console.log(`[PlaylistSync] Completed bulk sync of ${playlistIds.length} playlists`);
  }
  
  // =================== LIFECYCLE ===================
  
  destroy(): void {
    // Cancel all active syncs
    for (const playlistId of this.activeSyncs) {
      this.cancelSync(playlistId).catch(err => 
        console.error(`Failed to cancel sync for ${playlistId}:`, err)
      );
    }
    
    this.removeAllListeners();
    console.log('[PlaylistSync] Destroyed');
  }
} 