/**
 * @fileoverview playlistCreationStore.ts
 * LEGACY STORE - DISABLED
 * This store has been replaced by the new modular playlist store architecture.
 * All functionality is disabled to prevent conflicts with the new system.
 */

import { create } from 'zustand';
import { CreatePlaylistRequest, CreatePlaylistResponse, Playlist, PlaylistCategory, AssetVersion } from '@/types';
import { FtrackService } from '@/services/ftrack';
import { db } from './db';

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

  // Actions - ALL DISABLED
  createPlaylist: async (request: CreatePlaylistRequest, versions?: AssetVersion[]): Promise<Playlist> => {
    set({ isCreating: false, createError: 'Legacy playlist creation disabled. Use playlistStore.createPlaylist instead' });
    throw new Error('Legacy playlist creation disabled. Use playlistStore.createPlaylist instead');
  },

  syncPlaylist: async (playlistId: string): Promise<string> => {
    set({ isSyncing: false, syncError: 'Legacy sync disabled. Use playlistStore.syncPlaylist instead' });
    throw new Error('Legacy sync disabled. Use playlistStore.syncPlaylist instead');
  },

  fetchCategories: async (projectId: string): Promise<void> => {
    set({ categoriesLoading: true });
    try {
              const categories = await ftrackService.getListCategories(projectId);
      set({ categories, categoriesLoading: false });
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      set({ categoriesLoading: false });
    }
  },

  clearErrors: () => {
    set({ createError: null, syncError: null });
  },

  resetSyncState: () => {
    set({ 
      isSyncing: false, 
      syncError: null, 
      syncProgress: null 
    });
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

  invalidatePlaylistCache: async (playlistId: string): Promise<void> => {
    console.log('Legacy cache invalidation disabled for:', playlistId);
  },
})); 