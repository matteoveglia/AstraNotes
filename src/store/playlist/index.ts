/**
 * @fileoverview Playlist Store - Main API
 * Orchestrates all playlist operations through focused modules using stable UUIDs.
 * This is the public API that components will use.
 * NO ID CHANGES - playlists maintain stable UUIDs throughout their lifecycle.
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
import { PlaylistSync } from './PlaylistSync';
import { DraftManager } from './DraftManager';
import { FtrackService } from '@/services/ftrack';
import { PlaylistEntity, VersionEntity, PlaylistEvent } from './types';
import { Playlist, AssetVersion, CreatePlaylistRequest } from '@/types';

export class PlaylistStore extends SimpleEventEmitter {
  private repository = new PlaylistRepository();
  private cache = new PlaylistCache();
  private ftrackService = new FtrackService();
  private sync = new PlaylistSync(this.repository, this.cache, this.ftrackService);
  private drafts = new DraftManager(this.repository);
  
  constructor() {
    super();
    
    // Forward events from sync module to maintain backward compatibility
    this.sync.on('sync-started', (data: any) => this.emit('sync-started', data));
    this.sync.on('sync-completed', (data: any) => this.emit('sync-completed', data));
    this.sync.on('sync-failed', (data: any) => this.emit('sync-failed', data));
    
    console.log('[PlaylistStore] Initialized with modular architecture and stable UUIDs');
  }
  
  // =================== PLAYLIST OPERATIONS ===================
  
  /**
   * Creates a new playlist with a stable UUID that never changes
   */
  async createPlaylist(request: CreatePlaylistRequest): Promise<Playlist> {
    try {
      const id = crypto.randomUUID(); // Stable UUID - never changes
      const now = new Date().toISOString();
      
      console.log(`[PlaylistStore] Creating playlist with stable UUID: ${id}`);
      
      const entity: PlaylistEntity = {
        id,
        name: request.name,
        type: request.type,
        localStatus: 'draft',
        ftrackSyncStatus: 'not_synced',
        projectId: request.projectId,
        categoryId: request.categoryId,
        categoryName: request.categoryName,
        description: request.description,
        createdAt: now,
        updatedAt: now,
      };
      
      await this.repository.createPlaylist(entity);
      const playlist = this.entityToPlaylist(entity);
      this.cache.setPlaylist(id, playlist);
      
      console.log(`[PlaylistStore] Created playlist: ${id} - "${request.name}"`);
      this.emit('playlist-created', { playlistId: id, playlist });
      
      return playlist;
    } catch (error) {
      console.error('[PlaylistStore] Failed to create playlist:', error);
      this.emit('playlist-error', { operation: 'create', error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
  
  /**
   * Gets a playlist by its stable UUID
   */
  async getPlaylist(id: string): Promise<Playlist | null> {
    console.log(`[PlaylistStore] Getting playlist: ${id}`);
    
    // Check cache first
    let playlist = this.cache.getPlaylist(id);
    if (playlist) {
      console.log(`[PlaylistStore] Cache hit for playlist: ${id}`);
      return playlist;
    }
    
    // Load from database
    const entity = await this.repository.getPlaylist(id);
    if (!entity) {
      console.log(`[PlaylistStore] Playlist not found: ${id}`);
      return null;
    }
    
    // Load versions
    const versions = await this.repository.getPlaylistVersions(id);
    
    // Convert to UI model
    playlist = this.entityToPlaylist(entity, versions);
    this.cache.setPlaylist(id, playlist);
    
    console.log(`[PlaylistStore] Loaded playlist: ${id} with ${versions.length} versions`);
    return playlist;
  }
  
  /**
   * Updates a playlist (ID never changes)
   */
  async updatePlaylist(id: string, updates: Partial<PlaylistEntity>): Promise<void> {
    await this.repository.updatePlaylist(id, updates);
    this.cache.invalidate(id);
    
    console.log(`[PlaylistStore] Updated playlist: ${id}`, updates);
    this.emit('playlist-updated', { playlistId: id, updates });
  }
  
  /**
   * Deletes a playlist and all its versions
   */
  async deletePlaylist(id: string): Promise<void> {
    await this.repository.deletePlaylist(id);
    this.cache.invalidate(id);
    
    console.log(`[PlaylistStore] Deleted playlist: ${id}`);
    this.emit('playlist-deleted', { playlistId: id });
  }
  
  // =================== VERSION OPERATIONS ===================
  
  /**
   * Adds versions to a playlist
   */
  async addVersionsToPlaylist(playlistId: string, versions: AssetVersion[]): Promise<void> {
    const versionEntities = versions.map(v => this.assetVersionToEntity(v, playlistId));
    await this.repository.bulkAddVersions(playlistId, versionEntities);
    this.cache.invalidate(playlistId);
    
    console.log(`[PlaylistStore] Added ${versions.length} versions to playlist: ${playlistId}`);
    this.emit('versions-added', { playlistId, versions });
  }
  
  /**
   * Gets versions for a playlist
   */
  async getPlaylistVersions(playlistId: string): Promise<VersionEntity[]> {
    return await this.repository.getPlaylistVersions(playlistId);
  }
  
  /**
   * Removes a version from a playlist
   */
  async removeVersionFromPlaylist(playlistId: string, versionId: string): Promise<void> {
    await this.repository.removeVersionFromPlaylist(playlistId, versionId);
    this.cache.invalidate(playlistId);
    
    console.log(`[PlaylistStore] Removed version ${versionId} from playlist: ${playlistId}`);
    this.emit('version-removed', { playlistId, versionId });
  }
  
  // =================== SYNC OPERATIONS ===================
  
  /**
   * Syncs a playlist to ftrack WITHOUT changing its ID.
   * The playlist keeps its stable UUID, we just add ftrack metadata.
   */
  async syncPlaylist(playlistId: string): Promise<void> {
    console.log(`[PlaylistStore] Initiating sync for playlist: ${playlistId}`);
    return this.sync.syncPlaylist(playlistId);
  }
  
  /**
   * Checks sync status of a playlist
   */
  async getSyncStatus(playlistId: string): Promise<'not_synced' | 'syncing' | 'synced' | 'failed'> {
    return this.sync.checkSyncStatus(playlistId);
  }
  
  /**
   * Gets all currently syncing playlists
   */
  getActiveSyncs(): string[] {
    return this.sync.getActiveSyncs();
  }
  
  // =================== DRAFT OPERATIONS ===================
  
  /**
   * Saves draft content for a version
   */
  async saveDraft(playlistId: string, versionId: string, content: string, labelId?: string): Promise<void> {
    await this.drafts.saveDraft(playlistId, versionId, content, labelId);
    this.cache.invalidate(playlistId); // Invalidate to show updated draft
    
    this.emit('draft-saved', { playlistId, versionId, content, labelId });
  }
  
  /**
   * Gets draft content for a version
   */
  async getDraftContent(playlistId: string, versionId: string): Promise<string | null> {
    return this.drafts.getDraftContent(playlistId, versionId);
  }
  
  /**
   * Clears draft content for a version
   */
  async clearDraft(playlistId: string, versionId: string): Promise<void> {
    await this.drafts.clearDraft(playlistId, versionId);
    this.cache.invalidate(playlistId);
    
    this.emit('draft-cleared', { playlistId, versionId });
  }
  
  /**
   * Publishes a note
   */
  async publishNote(playlistId: string, versionId: string): Promise<void> {
    await this.drafts.publishNote(playlistId, versionId);
    this.cache.invalidate(playlistId);
    
    this.emit('note-published', { playlistId, versionId });
  }
  
  // =================== UTILITY METHODS ===================
  
  /**
   * Gets cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
  
  /**
   * Clears all caches
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[PlaylistStore] Cleared all caches');
  }
  
  /**
   * Gets playlist count
   */
  async getPlaylistCount(): Promise<number> {
    return this.repository.getPlaylistCount();
  }
  
  /**
   * Gets all playlists for a project
   */
  async getPlaylistsByProject(projectId: string): Promise<Playlist[]> {
    const entities = await this.repository.getPlaylistsByProject(projectId);
    return Promise.all(entities.map(async (entity) => {
      const versions = await this.repository.getPlaylistVersions(entity.id);
      return this.entityToPlaylist(entity, versions);
    }));
  }
  
  // =================== CONVERSION METHODS ===================
  
  private entityToPlaylist(entity: PlaylistEntity, versions?: VersionEntity[]): Playlist {
    return {
      id: entity.id, // STABLE UUID - never changes
      name: entity.name,
      title: entity.name,
      type: entity.type,
      versions: versions ? versions.map(v => this.entityToAssetVersion(v)) : [],
      notes: [], // Notes are separate from versions in this architecture
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      
      // Status mapping for UI compatibility
      isLocalOnly: entity.localStatus !== 'synced',
      ftrackSyncState: entity.ftrackSyncStatus === 'not_synced' ? 'pending' : entity.ftrackSyncStatus,
      
      // Additional metadata
      categoryId: entity.categoryId,
      categoryName: entity.categoryName,
    };
  }
  
  private entityToAssetVersion(entity: VersionEntity): AssetVersion {
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      thumbnailUrl: entity.thumbnailUrl,
      thumbnailId: entity.thumbnailId,
      reviewSessionObjectId: entity.reviewSessionObjectId,
      createdAt: entity.createdAt || new Date().toISOString(),
      updatedAt: entity.updatedAt || new Date().toISOString(),
      manuallyAdded: entity.manuallyAdded,
    };
  }
  
  private assetVersionToEntity(version: AssetVersion, playlistId: string): VersionEntity {
    return {
      id: version.id,
      playlistId,
      name: version.name,
      version: version.version,
      thumbnailUrl: version.thumbnailUrl,
      thumbnailId: version.thumbnailId,
      reviewSessionObjectId: version.reviewSessionObjectId,
      draftContent: undefined,
      labelId: '',
      noteStatus: 'empty',
      addedAt: new Date().toISOString(),
      lastModified: Date.now(),
      manuallyAdded: version.manuallyAdded || false,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    };
  }
  
  // =================== BACKWARD COMPATIBILITY METHODS ===================
  
  /**
   * @deprecated Use event listeners instead of polling
   * Legacy method for backward compatibility - does nothing in new architecture
   */
  stopPolling(): void {
    console.warn('[PlaylistStore] stopPolling() is deprecated - new architecture uses event-driven updates');
  }
  
  /**
   * @deprecated Use event listeners instead of polling
   * Legacy method for backward compatibility - does nothing in new architecture
   */
  async startPolling(
    _playlistId: string, 
    _callback?: (added: any, removed: any, addedVersions: any, removedVersions: any, freshVersions: any) => void
  ): Promise<void> {
    console.warn('[PlaylistStore] startPolling() is deprecated - use event listeners instead');
  }
  
  /**
   * @deprecated Use getPlaylist() instead
   * Legacy method for backward compatibility
   */
  async initializePlaylist(playlistId: string, _playlist: Playlist): Promise<void> {
    console.warn('[PlaylistStore] initializePlaylist() is deprecated - use getPlaylist() instead');
    await this.getPlaylist(playlistId);
  }
  
  /**
   * @deprecated Use createPlaylist() or updatePlaylist() instead
   * Legacy method for backward compatibility
   */
  async cachePlaylist(playlist: Playlist): Promise<void> {
    console.warn('[PlaylistStore] cachePlaylist() is deprecated - use createPlaylist() or updatePlaylist() instead');
    // For now, just cache it
    this.cache.setPlaylist(playlist.id, playlist);
  }
  
  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility - returns playlist as-is
   */
  cleanPlaylistForStorage(playlist: Playlist): Playlist {
    console.warn('[PlaylistStore] cleanPlaylistForStorage() is deprecated - not needed in new architecture');
    return playlist;
  }
  
  /**
   * @deprecated Use addVersionsToPlaylist() with array instead
   * Legacy method for backward compatibility
   */
  async addVersionToPlaylist(playlistId: string, version: AssetVersion): Promise<void> {
    await this.addVersionsToPlaylist(playlistId, [version]);
  }
  
  /**
   * @deprecated Use saveDraft() and updatePlaylist() instead
   * Legacy method for backward compatibility
   */
  async saveNoteStatus(versionId: string, playlistId: string, status: string, content: string, labelId?: string | boolean): Promise<void> {
    if (content) {
      await this.saveDraft(playlistId, versionId, content, typeof labelId === 'string' ? labelId : undefined);
    }
    // Note status is now handled internally by DraftManager
  }
  
  /**
   * @deprecated Use saveDraft() instead
   * Legacy method for backward compatibility
   */
  async saveAttachments(_versionId: string, _playlistId: string, _attachments: any[]): Promise<void> {
    console.warn('[PlaylistStore] saveAttachments() is deprecated - attachments are handled by DraftManager');
  }
  
  /**
   * @deprecated Use clearDraft() instead
   * Legacy method for backward compatibility
   */
  async clearAttachments(versionId: string, playlistId: string): Promise<void> {
    await this.clearDraft(playlistId, versionId);
  }
  
  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility
   */
  async clearAddedVersions(_playlistId: string): Promise<void> {
    console.warn('[PlaylistStore] clearAddedVersions() is deprecated - not needed in new architecture');
  }
  
  /**
   * @deprecated Use getPlaylistVersions() instead
   * Legacy method for backward compatibility
   */
  async getLocalPlaylistVersions(playlistId: string): Promise<VersionEntity[]> {
    return this.getPlaylistVersions(playlistId);
  }
  
  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility
   */
  async clearManuallyAddedFlags(_playlistId: string, _versionIds: string[]): Promise<void> {
    console.warn('[PlaylistStore] clearManuallyAddedFlags() is deprecated - not needed in new architecture');
  }
  
  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility
   */
  async updatePlaylistAndRestartPolling(
    _playlistId: string, 
    _callback?: (added: any, removed: any, addedVersions: any, removedVersions: any, freshVersions: any) => void
  ): Promise<void> {
    console.warn('[PlaylistStore] updatePlaylistAndRestartPolling() is deprecated - use event listeners instead');
  }
  
  /**
   * Initializes Quick Notes playlist in the database if it doesn't exist
   */
  async initializeQuickNotes(): Promise<void> {
    console.log('[PlaylistStore] Initializing Quick Notes playlist...');
    
    const quickNotesId = 'quick-notes';
    const existing = await this.repository.getPlaylist(quickNotesId);
    
    if (!existing) {
      const now = new Date().toISOString();
      const quickNotesEntity: PlaylistEntity = {
        id: quickNotesId,
        name: 'Quick Notes',
        type: 'list',
        localStatus: 'draft',
        ftrackSyncStatus: 'not_synced',
        projectId: 'none', // Quick Notes doesn't belong to a specific project
        createdAt: now,
        updatedAt: now,
      };
      
      await this.repository.createPlaylist(quickNotesEntity);
      console.log('[PlaylistStore] Created Quick Notes playlist in database');
    } else {
      console.log('[PlaylistStore] Quick Notes playlist already exists');
    }
  }
  
  // =================== LIFECYCLE ===================
  
  /**
   * Destroys the store and cleans up resources
   */
  destroy(): void {
    this.sync.destroy();
    this.cache.destroy();
    this.removeAllListeners();
    
    console.log('[PlaylistStore] Destroyed');
  }
}

// Export singleton instance for backward compatibility
export const playlistStore = new PlaylistStore();

// Export classes for direct instantiation if needed
export {
  PlaylistRepository,
  PlaylistCache, 
  PlaylistSync,
  DraftManager
};

// Export types
export * from './types'; 