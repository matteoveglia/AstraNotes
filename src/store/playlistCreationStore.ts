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
  syncPlaylist: (playlistId: string) => Promise<void>;
  fetchCategories: (projectId: string) => Promise<void>;
  clearErrors: () => void;
  resetSyncState: () => void;
  resetStore: () => void;
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

      // Store in local database
      await db.localPlaylists.add(localPlaylist);

      // If versions provided, store the associations
      if (versions && versions.length > 0) {
        const localVersions: LocalPlaylistVersion[] = versions.map(v => ({
          playlistId,
          versionId: v.id,
          addedAt: now,
        }));
        console.log('createPlaylist: Storing version associations:', {
          playlistId,
          versionsCount: versions.length,
          localVersions: localVersions.map(lv => ({ versionId: lv.versionId, addedAt: lv.addedAt }))
        });
        
        try {
          await db.localPlaylistVersions.bulkAdd(localVersions);
          console.log('createPlaylist: Version associations stored successfully');
          
          // Verify the data was stored correctly
          const verifyStored = await db.localPlaylistVersions.where('playlistId').equals(playlistId).toArray();
          console.log('createPlaylist: Verification - stored versions count:', verifyStored.length);
        } catch (error) {
          console.error('createPlaylist: Failed to store version associations:', error);
          throw error;
        }
      } else {
        console.log('createPlaylist: No versions provided to store');
      }

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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist';
      set({ isCreating: false, createError: errorMessage });
      throw error;
    }
  },

  syncPlaylist: async (playlistId: string): Promise<void> => {
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

      // Update local playlist as synced
      await db.localPlaylists.update(playlistId, {
        syncState: 'synced',
        ftrackId,
        updatedAt: new Date().toISOString(),
      });

      // Mark local versions as synced
      for (const localVersion of localVersions) {
        await db.localPlaylistVersions.update(
          [playlistId, localVersion.versionId],
          { syncedAt: new Date().toISOString() }
        );
      }

      set({ 
        isSyncing: false, 
        syncProgress: { current: 3, total: 3 }
      });

      // Clear progress after a short delay
      setTimeout(() => {
        set({ syncProgress: null });
      }, 1000);

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
})); 