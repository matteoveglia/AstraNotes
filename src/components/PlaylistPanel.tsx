/**
 * @fileoverview PlaylistPanel.tsx
 * Side panel for playlist management.
 * Provides listing, selection, status indication, refresh functionality,
 * old playlist removal, and Quick Notes handling.
 * @component
 */

import React, { useState, useEffect } from "react";
import type { Playlist, PlaylistCategory } from "@/types";
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
import { showContextMenu } from "@/utils/menu";
import { PlaylistList } from "./PlaylistList";

interface PlaylistItemProps {
  playlist: PlaylistWithStatus;
  isActive: boolean;
  onClick: () => void;
}

interface PlaylistWithStatus extends Playlist {
  status?: "added" | "removed";
}

interface PlaylistCategoryWithStatus extends Omit<PlaylistCategory, 'playlists'> {
  playlists: PlaylistWithStatus[];
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
}) => {
  const handleContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const options = [
      {
        label: "Remove Playlist",
        action: () => console.log("Remove playlist:", playlist.id),
        disabled: playlist.isQuickNotes,
      },
      {
        label: "Rename Playlist",
        action: () => console.log("Rename playlist:", playlist.id),
        disabled: playlist.isQuickNotes,
      },
    ];

    showContextMenu(e, options);
  };

  return (
    <motion.div
      key={playlist.id}
      className={cn(
        "p-2 rounded cursor-pointer mb-1 flex items-start justify-between gap-2",
        isActive
          ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        playlist.status === "removed" && "text-red-500",
        playlist.status === "added" && "text-green-500",
      )}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      variants={itemVariants}
    >
      <span className="break-words whitespace-normal flex-1 min-w-0">
        {playlist.title}
      </span>
      <div className="flex-shrink-0 flex items-center">
        {playlist.status === "removed" && (
          <MinusCircle className="h-4 w-4 text-red-500" />
        )}
        {playlist.status === "added" && (
          <PlusCircle className="h-4 w-4 text-green-500" />
        )}
      </div>
    </motion.div>
  );
};

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

  // Generate categories from playlists with status
  const generateCategories = (playlistsWithStatus: PlaylistWithStatus[]): PlaylistCategoryWithStatus[] => {
    // Filter out Quick Notes for categories
    const nonQuickNotesPlaylists = playlistsWithStatus.filter(
      (p) => p.id !== QUICK_NOTES_ID && !p.isQuickNotes
    );

    const categories: PlaylistCategoryWithStatus[] = [];

    // Group by type
    const reviewSessions = nonQuickNotesPlaylists.filter(p => p.type === 'reviewsession');
    const lists = nonQuickNotesPlaylists.filter(p => p.type === 'list');

    // Add review sessions as a category if any exist (preserve original order)
    if (reviewSessions.length > 0) {
      categories.push({
        id: 'review-sessions',
        name: 'Review Sessions',
        type: 'reviewsessions',
        playlists: reviewSessions
      });
    }

    // Group lists by category while preserving order
    const listsByCategory = new Map<string, PlaylistWithStatus[]>();
    
    // Process lists in their original order to maintain sorting
    lists.forEach(list => {
      const categoryKey = list.categoryId || 'uncategorized';
      const categoryName = list.categoryName || 'Uncategorized';
      
      if (!listsByCategory.has(categoryKey)) {
        listsByCategory.set(categoryKey, []);
      }
      listsByCategory.get(categoryKey)!.push(list);
    });

    // Add list categories in a consistent order and sort each category's playlists
    const sortedCategoryEntries = Array.from(listsByCategory.entries()).sort(([, listsA], [, listsB]) => {
      // Sort categories by the category name of the first playlist in each category
      const categoryNameA = listsA[0]?.categoryName || 'Uncategorized';
      const categoryNameB = listsB[0]?.categoryName || 'Uncategorized';
      return categoryNameA.localeCompare(categoryNameB);
    });

    for (const [categoryId, categoryLists] of sortedCategoryEntries) {
      const categoryName = categoryLists[0]?.categoryName || 'Uncategorized';
      
      // Sort playlists within each category by name, but put "removed" ones at the end
      const sortedPlaylists = categoryLists.sort((a, b) => {
        // If one is removed and the other isn't, put removed ones last
        if (a.status === "removed" && b.status !== "removed") return 1;
        if (b.status === "removed" && a.status !== "removed") return -1;
        
        // Otherwise sort by name
        return a.name.localeCompare(b.name);
      });
      
      categories.push({
        id: categoryId,
        name: `${categoryName} Lists`,
        type: 'lists',
        playlists: sortedPlaylists
      });
    }

    return categories;
  };

  // Initial load of playlists
  useEffect(() => {
    const loadPlaylists = async () => {
      setLoading(true);
      try {
        // Fetch both review sessions and lists
        const [reviewSessions, lists] = await Promise.all([
          ftrackService.getPlaylists(),
          ftrackService.getLists()
        ]);
        
        const allPlaylists = [...reviewSessions, ...lists];
        
        // Quick Notes is handled by the store's setPlaylists
        setStorePlaylists(allPlaylists);
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
      // Fetch both review sessions and lists
      const [latestReviewSessions, latestLists] = await Promise.all([
        ftrackService.getPlaylists(),
        ftrackService.getLists()
      ]);
      
      const latestPlaylists = [...latestReviewSessions, ...latestLists];

      // Create a map of current playlists for easy lookup
      const currentPlaylistMap = new Map(playlists.map((p) => [p.id, p]));

      // Get current playlists from the main store to preserve loaded data (like versions)
      const { playlists: storePlaylists } = usePlaylistsStore.getState();
      const storePlaylistMap = new Map(storePlaylists.map((p) => [p.id, p]));

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
          const existing = storePlaylistMap.get(latest.id);
          
          // If it exists in current list and was marked as added, clear the status
          if (current?.status === "added") {
            // Preserve existing data (like versions) if available
            const preservedData = existing || latest;
            return { ...preservedData, ...latest, status: undefined } as PlaylistWithStatus;
          }
          // If it's new, mark it as added
          if (!current) {
            return {
              ...latest,
              status: "added" as const,
            } as PlaylistWithStatus;
          }
          // Otherwise, merge latest data with existing data (preserving versions, etc.)
          const preservedData = existing || latest;
          return { ...preservedData, ...latest } as PlaylistWithStatus;
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
        .map((p) => {
          const existing = storePlaylistMap.get(p.id);
          // Preserve existing data (like versions) if available, regardless of previous status
          const preservedPlaylist = existing ? { ...existing, ...p } : p;
          return { ...preservedPlaylist, status: "removed" as const };
        });

      // Preserve data for existing removed playlists
      const existingRemovedPlaylists = playlists
        .filter((p) => p.status === "removed")
        .map((p) => {
          const existing = storePlaylistMap.get(p.id);
          // Preserve existing data (like versions) if available, but keep the "removed" status
          return existing ? { ...existing, ...p, status: "removed" as const } : p;
        });

      // Combine all playlists
      const updatedPlaylists = [
        ...(quickNotesPlaylist ? [quickNotesPlaylist] : []), // Keep Quick Notes
        ...existingRemovedPlaylists, // Keep existing removed (with data preserved)
        ...removedPlaylists, // Add newly removed (with data preserved)
        ...processedPlaylists, // Add current with status updates
      ];

      // Update local state with all playlists (including removed ones for status display)
      setPlaylists(updatedPlaylists);
      
      // Update the store with all playlists (including removed ones) preserving existing data
      // Removed playlists should remain functional until "Clear Old" is clicked
      const allPlaylistsForStore = [...processedPlaylists, ...removedPlaylists, ...existingRemovedPlaylists]
        .map(p => {
          const { status, ...cleanPlaylist } = p as any;
          return cleanPlaylist;
        });
      
      setStorePlaylists(allPlaylistsForStore);
    } catch (error) {
      console.error("Failed to refresh playlists:", error);
      setError("Failed to refresh playlists");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearOld = () => {
    const updatedPlaylists = playlists.filter((p) => p.status !== "removed");
    
    // Update local state
    setPlaylists(updatedPlaylists);
    
    // Get current playlists from the main store to preserve loaded data (like versions)
    const { playlists: storePlaylists } = usePlaylistsStore.getState();
    const storePlaylistMap = new Map(storePlaylists.map((p) => [p.id, p]));
    
    // Update the store with clean playlists (without status) while preserving existing data
    const cleanPlaylists = updatedPlaylists
      .filter(p => !p.isQuickNotes && p.status !== "removed") // Only non-Quick Notes, non-removed playlists
      .map(p => {
        const { status, ...cleanPlaylist } = p as any;
        const existing = storePlaylistMap.get(p.id);
        // Preserve existing data (like versions) if available
        return existing ? { ...existing, ...cleanPlaylist } : cleanPlaylist;
      });
    
    setStorePlaylists(cleanPlaylists);
  };

  const hasRemovedPlaylists = playlists?.some(
    (p) => !p.isQuickNotes && p.status === "removed",
  );

  // Separate Quick Notes from other playlists
  const quickNotesPlaylist = playlists.find(
    (p) => p.id === QUICK_NOTES_ID || p.isQuickNotes,
  );

  // Generate categories for PlaylistList
  const categories = generateCategories(playlists);

  return (
    <div className="w-72 border-r p-4 relative flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold">Playlists</h2>
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

      {/* Quick Notes section - fixed at the top */}
      {quickNotesPlaylist && (
        <div className="flex-shrink-0">
          <Button
            variant={activePlaylist === quickNotesPlaylist.id ? "default" : "outline"}
            size="lg"
            onClick={() => onPlaylistSelect(quickNotesPlaylist.id)}
            className="w-full justify-start text-left mb-1"
          >
            <span className="truncate flex-1">{quickNotesPlaylist.title}</span>
          </Button>
          <hr className="my-4 border-zinc-200 dark:border-zinc-700" />
        </div>
      )}

      {/* Scrollable playlists section */}
      <div className="flex-1 flex flex-col min-h-0">
        <motion.div
          className="flex-1 flex flex-col min-h-0 pr-2"
          variants={gridVariants}
          initial="hidden"
          animate="visible"
        >
          <PlaylistList
            categories={categories}
            loading={loading}
            error={error}
            onSelect={(playlist) => onPlaylistSelect(playlist.id)}
            activePlaylistId={
              // If Quick Notes is active, don't show any carousel playlist as selected
              (activePlaylist === QUICK_NOTES_ID || activePlaylist === "quick-notes") 
                ? null
                : activePlaylist
            }
          />
        </motion.div>
      </div>

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
