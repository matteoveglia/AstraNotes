import React, { useState, useEffect } from "react";
import type { Playlist } from "../types";
import { Loader2, AlertCircle, RefreshCw, MinusCircle, PlusCircle, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { ftrackService } from "../services/ftrack";
import { usePlaylistsStore } from "@/store/playlistsStore";

interface PlaylistItemProps {
  playlist: PlaylistWithStatus;
  isActive: boolean;
  onClick: () => void;
}

interface PlaylistWithStatus extends Playlist {
  status?: 'added' | 'removed';
}

const QUICK_NOTES_ID = 'quick-notes';

const PlaylistItem: React.FC<PlaylistItemProps> = ({
  playlist,
  isActive,
  onClick,
}) => (
  <div
    className={cn(
      "p-2 rounded cursor-pointer mb-1 flex items-center justify-between",
      isActive ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100",
      playlist.status === 'removed' && "text-red-500",
      playlist.status === 'added' && "text-green-500"
    )}
    onClick={onClick}
  >
    <span>{playlist.title}</span>
    {playlist.status === 'removed' && <MinusCircle className="h-4 w-4 text-red-500" />}
    {playlist.status === 'added' && <PlusCircle className="h-4 w-4 text-green-500" />}
  </div>
);

interface PlaylistPanelProps {
  playlists: Playlist[];
  activePlaylist: string | null;
  onPlaylistSelect: (playlistId: string) => void;
  loading: boolean;
  error: string | null;
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  playlists: initialPlaylists,
  activePlaylist,
  onPlaylistSelect,
  loading: initialLoading,
  error: initialError,
}) => {
  const [playlists, setPlaylists] = useState<PlaylistWithStatus[]>(initialPlaylists);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(initialError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { setPlaylists: setStorePlaylists } = usePlaylistsStore();

  // Initial load of playlists
  useEffect(() => {
    const loadPlaylists = async () => {
      setLoading(true);
      try {
        const fetchedPlaylists = await ftrackService.getPlaylists();
        // Quick Notes is handled by the store's setPlaylists
        setStorePlaylists(fetchedPlaylists);
        // Get playlists from store after Quick Notes is added
        const { playlists: updatedPlaylists } = usePlaylistsStore.getState();
        setPlaylists(updatedPlaylists);
      } catch (error) {
        console.error("Failed to load playlists:", error);
        setError("Failed to load playlists");
      } finally {
        setLoading(false);
      }
    };

    loadPlaylists();
  }, []); // Only run on mount

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const latestPlaylists = await ftrackService.getPlaylists();
      
      // Create a map of current playlists for easy lookup
      const currentPlaylistMap = new Map(
        playlists.map(p => [p.id, p])
      );

      // Process each playlist from the latest fetch
      const processedPlaylists = latestPlaylists.map(latest => {
        // Never modify Quick Notes
        if (latest.id === QUICK_NOTES_ID || latest.isQuickNotes) {
          return currentPlaylistMap.get(QUICK_NOTES_ID) || latest;
        }

        const current = currentPlaylistMap.get(latest.id);
        // If it exists in current list and was marked as added, clear the status
        if (current?.status === 'added') {
          return { ...latest, status: undefined };
        }
        // If it's new, mark it as added
        if (!current) {
          return { ...latest, status: 'added' as const };
        }
        // Otherwise, keep as is
        return latest;
      });

      // Find removed playlists (excluding Quick Notes)
      const removedPlaylists = playlists
        .filter(p => 
          !p.isQuickNotes && // Never remove Quick Notes
          p.status !== 'removed' && // Don't re-mark already removed playlists
          !latestPlaylists.some(l => l.id === p.id)
        )
        .map(p => ({ ...p, status: 'removed' as const }));

      // Combine all playlists:
      // 1. Keep currently removed playlists
      // 2. Add newly removed playlists
      // 3. Add all current playlists (with status updates)
      const updatedPlaylists = [
        ...playlists.filter(p => p.status === 'removed'), // Keep existing removed
        ...removedPlaylists, // Add newly removed
        ...processedPlaylists // Add current with status updates
      ];

      // Update both local state and store
      setStorePlaylists(updatedPlaylists);
      // Get playlists from store after Quick Notes is handled
      const { playlists: finalPlaylists } = usePlaylistsStore.getState();
      setPlaylists(finalPlaylists);
    } catch (error) {
      console.error("Failed to refresh playlists:", error);
      setError("Failed to refresh playlists");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearOld = () => {
    const updatedPlaylists = playlists.filter(p => p.status !== 'removed');
    setStorePlaylists(updatedPlaylists);
    // Get playlists from store after Quick Notes is handled
    const { playlists: finalPlaylists } = usePlaylistsStore.getState();
    setPlaylists(finalPlaylists);
  };

  const hasRemovedPlaylists = playlists.some(p => 
    !p.isQuickNotes && p.status === 'removed'
  );

  return (
    <div className="w-72 border-r p-4 overflow-y-auto relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Playlists</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={cn(
            "gap-2",
            isRefreshing && "animate-spin"
          )}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-gray-500 h-full">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading playlists...</span>
        </div>
      ) : error ? (
        <div className="flex items-center text-red-500 p-2 bg-red-50 rounded">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      ) : (
        <div>
          {playlists.map((playlist) => (
            <PlaylistItem
              key={playlist.id}
              playlist={playlist}
              isActive={activePlaylist !== null && playlist.id === activePlaylist}
              onClick={() => onPlaylistSelect(playlist.id)}
            />
          ))}
        </div>
      )}

      {hasRemovedPlaylists && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearOld}
          className="absolute bottom-4 right-4 gap-2"
        >
          <XCircle className="h-4 w-4" />
          Clear Old
        </Button>
      )}
    </div>
  );
};
