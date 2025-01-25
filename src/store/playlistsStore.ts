import { create } from "zustand";
import { Playlist, AssetVersion } from "../types";
import { ftrackService } from "../services/ftrack";

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
  playlists: [],
  activePlaylistId: null,
  isLoading: false,
  error: null,

  setPlaylists: (playlists) => set({ playlists }),
  setActivePlaylist: (playlistId) => set({ activePlaylistId: playlistId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadPlaylists: async () => {
    const { setLoading, setError, setPlaylists } = get();
    setLoading(true);
    setError(null);
    
    try {
      const fetchedPlaylists = await ftrackService.getPlaylists();
      setPlaylists(fetchedPlaylists);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load playlists");
      console.error("Failed to load playlists:", error);
    } finally {
      setLoading(false);
    }
  },

  updatePlaylist: async (playlistId) => {
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
        p.id === playlistId ? freshPlaylist : p
      );
      setPlaylists(updatedPlaylists);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update playlist");
      console.error("Failed to update playlist:", error);
    }
  },
}));
