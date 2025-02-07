/**
 * @fileoverview playlistsStore.ts
 * Global playlist state management using Zustand.
 * Features:
 * - Quick Notes playlist handling
 * - Active playlist tracking
 * - Playlist loading and updates
 * - Error state management
 */

import { create } from "zustand";
import { Playlist } from "../types";
import { ftrackService } from "../services/ftrack";

const QUICK_NOTES_PLAYLIST: Playlist = {
  id: "quick-notes",
  name: "Quick Notes",
  title: "Quick Notes",
  notes: [],
  versions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isQuickNotes: true,
};

interface PlaylistsState {
  playlists: Playlist[];
  activePlaylistId: string | null;
  isLoading: boolean;
  error: string | null;
  setPlaylists: (playlists: Playlist[]) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  loadPlaylists: () => Promise<void>;
  updatePlaylist: (playlistId: string) => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>()((set, get) => ({
  playlists: [QUICK_NOTES_PLAYLIST],
  activePlaylistId: "quick-notes",
  isLoading: false,
  error: null,

  setPlaylists: (playlists) => {
    // Always ensure Quick Notes is in the list
    const hasQuickNotes = playlists.some((p) => p.id === "quick-notes");
    const finalPlaylists = hasQuickNotes
      ? playlists
      : [QUICK_NOTES_PLAYLIST, ...playlists];
    set({ playlists: finalPlaylists });
  },

  setActivePlaylist: (playlistId) => set({ activePlaylistId: playlistId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadPlaylists: async () => {
    const { setLoading, setError, setPlaylists } = get();
    setLoading(true);
    setError(null);

    try {
      const fetchedPlaylists = await ftrackService.getPlaylists();
      setPlaylists(fetchedPlaylists); // Quick Notes will be preserved by setPlaylists
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to load playlists",
      );
      console.error("Failed to load playlists:", error);
    } finally {
      setLoading(false);
    }
  },

  updatePlaylist: async (playlistId) => {
    // Don't update Quick Notes from Ftrack
    if (playlistId === "quick-notes") return;

    const { setError, playlists, setPlaylists } = get();
    setError(null);

    try {
      const fresh = await ftrackService.getPlaylists();
      const freshPlaylist = fresh.find((p) => p.id === playlistId);

      if (!freshPlaylist) {
        console.log("No playlist found with id:", playlistId);
        return;
      }

      // Update the playlist in the store
      const updatedPlaylists = playlists.map((p) =>
        p.id === playlistId ? freshPlaylist : p,
      );
      setPlaylists(updatedPlaylists);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to update playlist",
      );
      console.error("Failed to update playlist:", error);
    }
  },
}));
