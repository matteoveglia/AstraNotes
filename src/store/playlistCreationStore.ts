/**
 * @fileoverview playlistCreationStore.ts
 * Zustand store for managing playlist creation and synchronization.
 * Handles:
 * - Local playlist creation
 * - ftrack synchronization
 * - Available categories fetching
 * - Error and loading states
 */

import { create } from 'zustand';
import { CreatePlaylistRequest, CreatePlaylistResponse, Playlist, PlaylistCategory, AssetVersion } from '@/types';
import { FtrackService } from '@/services/ftrack';
import { db, LocalPlaylist, LocalPlaylistVersion } from './db';

interface PlaylistCreationState {
  // Creation state
  isCreating: boolean;
  createError: string | null;
  
  // Sync state  
  isSyncing: boolean;
  syncError: string | null;
  syncProgress: { current: number; total: number } | null;
  
  // Available options
  categories: PlaylistCategory[];
  categoriesLoading: boolean;
  
  // Actions
  createPlaylist: (request: CreatePlaylistRequest, versions?: AssetVersion[]) => Promise<Playlist>;
  syncPlaylist: (playlistId: string) => Promise<string>;
  fetchCategories: (projectId: string) => Promise<void>;
  clearErrors: () => void;
  resetSyncState: () => void;
  resetStore: () => void;
  invalidatePlaylistCache: (playlistId: string) => Promise<void>;
}

const ftrackService = new FtrackService();

export const usePlaylistCreationStore = create<PlaylistCreationState>((set, get) => ({
  // Initial state
  isCreating: false,
  createError: null,
  isSyncing: false,
  syncError: null,
  syncProgress: null,
  categories: [],
  categoriesLoading: false,

  // Actions
  createPlaylist: async (request: CreatePlaylistRequest, versions?: AssetVersion[]): Promise<Playlist> => {
    set({ isCreating: true, createError: null });

    try {
      // OPTIMIZE: Single transaction for all operations
      return await db.transaction('rw', [db.localPlaylists, db.localPlaylistVersions, db.versions], async () => {
        // Generate unique ID for local playlist
        const playlistId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        // Create local playlist record
        const localPlaylist: LocalPlaylist = {
          id: playlistId,
          name: request.name,
          type: request.type,
          categoryId: request.categoryId,
          categoryName: request.categoryName,
          description: request.description,
          projectId: request.projectId,
          isLocalOnly: true,
          syncState: 'pending',
          createdAt: now,
          updatedAt: now,
        };

        // OPTIMIZE: Parallel operations
        const operations = [db.localPlaylists.add(localPlaylist)];

        // If versions provided, store the associations
        if (versions && versions.length > 0) {
          const localVersions: LocalPlaylistVersion[] = versions.map(v => ({
            playlistId,
            versionId: v.id,
            addedAt: now,
          }));

          // NEW: Also write to versions table with enhanced fields
          const versionEntries = versions.map(v => ({
            ...db.cleanVersionForStorage(v, playlistId, true, now),
            manuallyAdded: false,
          }));

          console.log('createPlaylist: Storing version associations:', {
            playlistId,
            versionsCount: versions.length,
            localVersions: localVersions.map(lv => ({ versionId: lv.versionId, addedAt: lv.addedAt }))
          });
          
          operations.push(
            db.localPlaylistVersions.bulkAdd(localVersions), // Keep for safety during transition
            db.versions.bulkAdd(versionEntries)              // New primary path
          );
        } else {
          console.log('createPlaylist: No versions provided to store');
        }

        await Promise.all(operations);

        // Create playlist object to return
        const playlist: Playlist = {
          id: playlistId,
          name: request.name,
          title: request.name,
          notes: [],
          createdAt: now,
          updatedAt: now,
          type: request.type,
          categoryId: request.categoryId,
          categoryName: request.categoryName,
          isLocalOnly: true,
          localVersions: versions || [],
          ftrackSyncState: 'pending',
          versions: versions || [],
        };

        set({ isCreating: false });
        return playlist;
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist';
      set({ isCreating: false, createError: errorMessage });
      throw error;
    }
  },

  syncPlaylist: async (playlistId: string): Promise<string> => {
    console.log('syncPlaylist called with ID:', playlistId);
    set({ isSyncing: true, syncError: null, syncProgress: { current: 0, total: 1 } });

    try {
      // Get local playlist data
      console.log('Looking up local playlist in database:', playlistId);
      const localPlaylist = await db.localPlaylists.get(playlistId);
      console.log('Local playlist found:', localPlaylist);
      if (!localPlaylist) {
        throw new Error('Local playlist not found');
      }

      // Check if already synced
      if (localPlaylist.syncState === 'synced' && localPlaylist.ftrackId) {
        console.log('Playlist already synced, skipping sync:', localPlaylist.ftrackId);
        set({ isSyncing: false, syncProgress: null });
        return localPlaylist.ftrackId;
      }

      // Get associated versions
      console.log('syncPlaylist: Querying localPlaylistVersions for playlistId:', playlistId);
      const localVersions = await db.localPlaylistVersions.where('playlistId').equals(playlistId).toArray();
      console.log('syncPlaylist: Query completed. Found local versions for sync:', {
        playlistId,
        versionsCount: localVersions.length,
        versions: localVersions.map(lv => ({ versionId: lv.versionId, addedAt: lv.addedAt }))
      });
      

      
      set({ syncProgress: { current: 1, total: 3 } });

      // Create playlist in ftrack
      const createRequest: CreatePlaylistRequest = {
        name: localPlaylist.name,
        type: localPlaylist.type,
        categoryId: localPlaylist.categoryId,
        categoryName: localPlaylist.categoryName,
        description: localPlaylist.description,
        projectId: localPlaylist.projectId,
      };

      let ftrackId: string;
      
      if (localPlaylist.type === 'reviewsession') {
        const response = await ftrackService.createReviewSession(createRequest);
        if (!response.success) {
          throw new Error(response.error || 'Failed to create review session');
        }
        ftrackId = response.id;
      } else {
        const response = await ftrackService.createList(createRequest);
        if (!response.success) {
          throw new Error(response.error || 'Failed to create list');
        }
        ftrackId = response.id;
      }

      set({ syncProgress: { current: 2, total: 3 } });

      // Add versions to ftrack playlist if any
      if (localVersions.length > 0) {
        console.log('Starting version sync for', {
          ftrackId,
          versionsCount: localVersions.length,
          playlistType: localPlaylist.type
        });
        
        const versionIds = localVersions.map(lv => lv.versionId);
        const syncResponse = await ftrackService.addVersionsToPlaylist(
          ftrackId,
          versionIds,
          localPlaylist.type
        );

        console.log('Version sync response:', syncResponse);

        if (!syncResponse.success) {
          throw new Error(syncResponse.error || 'Failed to sync versions');
        }
      } else {
        console.log('No local versions found to sync for playlist:', playlistId);
      }

      // Update version references to keep pointing to original playlist ID
      if (localVersions.length > 0) {
        await db.versions.where('playlistId').equals(playlistId).modify({
          // Keep original playlistId to preserve all relationships
          syncedAt: new Date().toISOString(),
          manuallyAdded: false,        // Clear manual flags
        });
      }

      // Update the local playlist to mark it as synced - DO NOT DELETE IT
      await db.localPlaylists.update(playlistId, {
        syncState: 'synced',
        isLocalOnly: false,
        ftrackId: ftrackId,          // Store the ftrack ID for reference
        updatedAt: new Date().toISOString(),
      });
      console.log('Updated local playlist to synced state:', playlistId, 'with ftrackId:', ftrackId);

      // Keep local playlist versions entries as they maintain version relationships
      // DO NOT delete them - they preserve the connection between playlist and versions

      // Clear cache for the playlist to force reload with updated sync state
      await get().invalidatePlaylistCache(playlistId);

      console.log('Playlist sync completed successfully:', {
        playlistId: playlistId,       // Keep same playlist ID
        ftrackId: ftrackId,          // But now linked to ftrack
        versionsCount: localVersions.length
      });

      set({ 
        isSyncing: false, 
        syncProgress: { current: 3, total: 3 }
      });

      // Clear progress after a short delay
      setTimeout(() => {
        set({ syncProgress: null });
      }, 1000);

      // Emit a custom event to notify components about the successful sync
      window.dispatchEvent(new CustomEvent('playlist-synced', {
        detail: { 
          playlistId: playlistId,     // Same playlist ID preserved
          ftrackId: ftrackId,         // New ftrack ID for reference
          playlistName: localPlaylist.name
        }
      }));

      // Return the same playlist ID since we converted it in place
      return playlistId;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync playlist';
      set({ isSyncing: false, syncError: errorMessage, syncProgress: null });
      throw error;
    }
  },

  fetchCategories: async (projectId: string): Promise<void> => {
    set({ categoriesLoading: true });
    
    try {
      const categories = await ftrackService.getListCategories(projectId);
      set({ categories, categoriesLoading: false });
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      set({ categories: [], categoriesLoading: false });
    }
  },

  clearErrors: () => {
    set({ createError: null, syncError: null });
  },

  resetSyncState: () => {
    set({ isSyncing: false, syncError: null, syncProgress: null });
  },

  resetStore: () => {
    set({
      isCreating: false,
      createError: null,
      isSyncing: false,
      syncError: null,
      syncProgress: null,
      categories: [],
      categoriesLoading: false,
    });
  },

  /**
   * Helper method to invalidate playlist cache
   */
  invalidatePlaylistCache: async (playlistId: string): Promise<void> => {
    try {
      // Remove from playlists cache
      await db.playlists.where('id').equals(playlistId).delete();
      console.log(`Invalidated cache for playlist: ${playlistId}`);
    } catch (error) {
      console.warn(`Failed to invalidate cache for playlist ${playlistId}:`, error);
    }
  },
})); 