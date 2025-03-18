/**
 * @fileoverview PlaylistPanel.tsx
 * Side panel for playlist management.
 * Provides listing, selection, status indication, refresh functionality,
 * old playlist removal, and Quick Notes handling.
 * @component
 */

import React, { useState, useEffect } from "react";
import type { Playlist } from "../types";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  MinusCircle,
  PlusCircle,
  XCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { ftrackService } from "../services/ftrack";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { motion } from "motion/react";

interface PlaylistItemProps {
  playlist: PlaylistWithStatus;
  isActive: boolean;
  onClick: () => void;
}

interface PlaylistWithStatus extends Playlist {
  status?: "added" | "removed";
}

const QUICK_NOTES_ID = "quick-notes";

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const PlaylistItem: React.FC<PlaylistItemProps> = ({
  playlist,
  isActive,
  onClick,
}) => (
  <motion.div
    key={playlist.id}
    className={cn(
      "p-2 rounded cursor-pointer mb-1 flex items-center justify-between",
      isActive ? "bg-blue-100 text-blue-800" : "hover:bg-gray-100",
      playlist.status === "removed" && "text-red-500",
      playlist.status === "added" && "text-green-500",
    )}
    onClick={onClick}
    variants={itemVariants}
  >
    <span>{playlist.title}</span>
    {playlist.status === "removed" && (
      <MinusCircle className="h-4 w-4 text-red-500" />
    )}
    {playlist.status === "added" && (
      <PlusCircle className="h-4 w-4 text-green-500" />
    )}
  </motion.div>
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
  const [playlists, setPlaylists] =
    useState<PlaylistWithStatus[]>(initialPlaylists);
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
      const currentPlaylistMap = new Map(playlists.map((p) => [p.id, p]));

      // Always preserve Quick Notes from current state
      const quickNotesPlaylist = playlists.find(
        (p) => p.id === QUICK_NOTES_ID || p.isQuickNotes,
      );

      // Process each playlist from the latest fetch
      const processedPlaylists = latestPlaylists
        .map((latest) => {
          // Skip Quick Notes
          if (latest.id === QUICK_NOTES_ID || latest.isQuickNotes) {
            return null;
          }

          const current = currentPlaylistMap.get(latest.id);
          // If it exists in current list and was marked as added, clear the status
          if (current?.status === "added") {
            return { ...latest, status: undefined } as PlaylistWithStatus;
          }
          // If it's new, mark it as added
          if (!current) {
            return {
              ...latest,
              status: "added" as const,
            } as PlaylistWithStatus;
          }
          // Otherwise, keep as is
          return latest as PlaylistWithStatus;
        })
        .filter((p): p is PlaylistWithStatus => p !== null); // Type guard to remove nulls

      // Find removed playlists (excluding Quick Notes)
      const removedPlaylists = playlists
        .filter(
          (p) =>
            !p.isQuickNotes && // Never remove Quick Notes
            p.status !== "removed" && // Don't re-mark already removed playlists
            !latestPlaylists.some((l) => l.id === p.id),
        )
        .map((p) => ({ ...p, status: "removed" as const }));

      // Combine all playlists:
      // 1. Keep Quick Notes
      // 2. Keep currently removed playlists
      // 3. Add newly removed playlists
      // 4. Add all current playlists (with status updates)
      const updatedPlaylists = [
        ...(quickNotesPlaylist ? [quickNotesPlaylist] : []), // Keep Quick Notes
        ...playlists.filter((p) => p.status === "removed"), // Keep existing removed
        ...removedPlaylists, // Add newly removed
        ...processedPlaylists, // Add current with status updates
      ];

      // Only update local state for status changes
      setPlaylists(updatedPlaylists);
    } catch (error) {
      console.error("Failed to refresh playlists:", error);
      setError("Failed to refresh playlists");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearOld = () => {
    const updatedPlaylists = playlists.filter((p) => p.status !== "removed");
    setStorePlaylists(updatedPlaylists);
    // Get playlists from store after Quick Notes is handled
    const { playlists: finalPlaylists } = usePlaylistsStore.getState();
    setPlaylists(finalPlaylists);
  };

  const hasRemovedPlaylists = playlists.some(
    (p) => !p.isQuickNotes && p.status === "removed",
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
          className={cn("gap-2", isRefreshing)}
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-gray-500 h-[300px]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span>Loading playlists...</span>
        </div>
      ) : error ? (
        <div className="flex items-center text-red-500 p-2 bg-red-50 rounded">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      ) : (
        <motion.div
          className="space-y-2 overflow-y-auto"
          style={{ height: "calc(100vh - 200px)" }}
          variants={gridVariants}
          initial="hidden"
          animate="visible"
        >
          {playlists.map((playlist) => (
            <PlaylistItem
              key={playlist.id}
              playlist={playlist}
              isActive={
                activePlaylist !== null && playlist.id === activePlaylist
              }
              onClick={() => onPlaylistSelect(playlist.id)}
            />
          ))}
        </motion.div>
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
