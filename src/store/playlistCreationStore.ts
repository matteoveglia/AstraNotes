/**
 * @fileoverview playlistCreationStore.ts
 * LEGACY STORE - DISABLED
 * This store has been replaced by the new modular playlist store architecture.
 * All functionality is disabled to prevent conflicts with the new system.
 */

import { create } from "zustand";
import {
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  Playlist,
  PlaylistCategory,
  AssetVersion,
} from "@/types";
import { FtrackService } from "@/services/ftrack";
import { db } from "./db";
import { playlistStore } from "./playlist";

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
  createPlaylist: (
    request: CreatePlaylistRequest,
    versions?: AssetVersion[],
  ) => Promise<Playlist>;
  syncPlaylist: (playlistId: string) => Promise<string>;
  fetchCategories: (projectId: string) => Promise<void>;
  clearErrors: () => void;
  resetSyncState: () => void;
  resetStore: () => void;
  invalidatePlaylistCache: (playlistId: string) => Promise<void>;
}

const ftrackService = new FtrackService();

export const usePlaylistCreationStore = create<PlaylistCreationState>(
  (set, get) => ({
    // Initial state
    isCreating: false,
    createError: null,
    isSyncing: false,
    syncError: null,
    syncProgress: null,
    categories: [],
    categoriesLoading: false,

    // Actions
    createPlaylist: async (
      request: CreatePlaylistRequest,
      versions?: AssetVersion[],
    ): Promise<Playlist> => {
      set({ isCreating: true, createError: null });

      try {
        console.log(
          "[PlaylistCreationStore] Creating playlist via modular store:",
          request,
        );

        // Create playlist using new modular store
        const playlist = await playlistStore.createPlaylist(request);

        // Add versions if provided
        if (versions && versions.length > 0) {
          console.log(
            `[PlaylistCreationStore] Adding ${versions.length} versions to playlist ${playlist.id}`,
          );
          await playlistStore.addVersionsToPlaylist(playlist.id, versions);

          // Get updated playlist with versions
          const updatedPlaylist = await playlistStore.getPlaylist(playlist.id);
          if (updatedPlaylist) {
            set({ isCreating: false });
            return updatedPlaylist;
          }
        }

        set({ isCreating: false });
        return playlist;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create playlist";
        console.error("[PlaylistCreationStore] Create playlist failed:", error);
        set({ isCreating: false, createError: errorMessage });
        throw error;
      }
    },

    syncPlaylist: async (playlistId: string): Promise<string> => {
      set({
        isSyncing: true,
        syncError: null,
        syncProgress: { current: 0, total: 1 },
      });

      try {
        console.log(
          "[PlaylistCreationStore] Syncing playlist via modular store:",
          playlistId,
        );

        // Sync playlist using new modular store
        await playlistStore.syncPlaylist(playlistId);

        // Get ftrack ID from synced playlist
        const ftrackId = await playlistStore.getFtrackId(playlistId);

        if (!ftrackId) {
          throw new Error("Sync completed but no ftrack ID found");
        }

        set({ isSyncing: false, syncProgress: null });
        return ftrackId;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to sync playlist";
        console.error("[PlaylistCreationStore] Sync playlist failed:", error);
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
        console.error("Failed to fetch categories:", error);
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
        syncProgress: null,
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
      console.log("Legacy cache invalidation disabled for:", playlistId);
    },
  }),
);
