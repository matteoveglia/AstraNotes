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
  RefreshCw,
  MinusCircle,
  PlusCircle,
  XCircle,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ftrackService } from "../services/ftrack";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { useProjectStore } from "@/store/projectStore";
import { motion } from "motion/react";
import { showContextMenu } from "@/utils/menu";
import { PlaylistList } from "./PlaylistList";
import { PlaylistPanelEmptyState } from "./EmptyStates";
import { CreatePlaylistDialog } from "@/features/playlists/components/CreatePlaylistDialog";
import { db } from "@/store/db";

interface PlaylistItemProps {
  playlist: PlaylistWithStatus;
  isActive: boolean;
  onClick: () => void;
}

interface PlaylistWithStatus extends Playlist {
  status?: "added" | "removed";
}

interface PlaylistCategoryWithStatus
  extends Omit<PlaylistCategory, "playlists"> {
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
        "p-2 rounded cursor-pointer mb-1 flex items-start justify-between gap-2 select-none",
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
      <span className="break-words whitespace-normal flex-1 min-w-0 select-none">
        {playlist.title}
      </span>
      <div className="shrink-0 flex items-center">
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
  /** Optional refresh callback from parent to ensure proper state synchronization */
  onRefresh?: () => Promise<void>;
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  playlists: initialPlaylists,
  activePlaylist,
  onPlaylistSelect,
  loading: initialLoading,
  error: initialError,
  onRefresh,
}) => {
  const [playlists, setPlaylists] = useState<PlaylistWithStatus[]>([]);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(initialError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showDeletedPlaylistsAlert, setShowDeletedPlaylistsAlert] =
    useState(false);
  const [playlistsToDelete, setPlaylistsToDelete] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [deletedPlaylistsInfo, setDeletedPlaylistsInfo] = useState<{
    playlists: Array<{ id: string; name: string }>;
  } | null>(null);
  const { setPlaylists: setStorePlaylists, loadPlaylists } =
    usePlaylistsStore();
  const { selectedProjectId, hasValidatedSelectedProject } = useProjectStore();

  // Generate categories from playlists with status
  const generateCategories = (
    playlistsWithStatus: PlaylistWithStatus[],
  ): PlaylistCategoryWithStatus[] => {
    // Filter out Quick Notes for categories
    const nonQuickNotesPlaylists = playlistsWithStatus.filter(
      (p) => p.id !== QUICK_NOTES_ID && !p.isQuickNotes,
    );

    const categories: PlaylistCategoryWithStatus[] = [];

    // Group by type
    const reviewSessions = nonQuickNotesPlaylists.filter(
      (p) => p.type === "reviewsession",
    );
    const lists = nonQuickNotesPlaylists.filter((p) => p.type === "list");

    // Add review sessions as a category if any exist (sort by created_at, newest first)
    if (reviewSessions.length > 0) {
      const sortedReviewSessions = reviewSessions.sort((a, b) => {
        // If one is removed and the other isn't, put removed ones last
        if (a.status === "removed" && b.status !== "removed") return 1;
        if (b.status === "removed" && a.status !== "removed") return -1;

        // Sort by created_at (newest first)
        const dateA = (a as any).created_at || "";
        const dateB = (b as any).created_at || "";

        if (!dateA && !dateB) return a.name.localeCompare(b.name);
        if (!dateA) return 1;
        if (!dateB) return -1;

        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      categories.push({
        id: "review-sessions",
        name: "Review Sessions",
        type: "reviewsessions",
        playlists: sortedReviewSessions,
      });
    }

    // Group lists by category while preserving order
    const listsByCategory = new Map<string, PlaylistWithStatus[]>();

    // Process lists in their original order to maintain sorting
    lists.forEach((list) => {
      const categoryKey = list.categoryId || "uncategorized";
      const categoryName = list.categoryName || "Uncategorized";

      if (!listsByCategory.has(categoryKey)) {
        listsByCategory.set(categoryKey, []);
      }
      listsByCategory.get(categoryKey)!.push(list);
    });

    // Add list categories in a consistent order and sort each category's playlists
    const sortedCategoryEntries = Array.from(listsByCategory.entries()).sort(
      ([, listsA], [, listsB]) => {
        // Sort categories by the category name of the first playlist in each category
        const categoryNameA = listsA[0]?.categoryName || "Uncategorized";
        const categoryNameB = listsB[0]?.categoryName || "Uncategorized";
        return categoryNameA.localeCompare(categoryNameB);
      },
    );

    for (const [categoryId, categoryLists] of sortedCategoryEntries) {
      const categoryName = categoryLists[0]?.categoryName || "Uncategorized";

      // Sort playlists within each category by date, but put "removed" ones at the end
      const sortedPlaylists = categoryLists.sort((a, b) => {
        // If one is removed and the other isn't, put removed ones last
        if (a.status === "removed" && b.status !== "removed") return 1;
        if (b.status === "removed" && a.status !== "removed") return -1;

        // Otherwise sort by date (newest first)
        const getDateValue = (playlist: PlaylistWithStatus): string => {
          if (playlist.type === "reviewsession") {
            return (playlist as any).created_at || "";
          } else {
            return (playlist as any).date || "";
          }
        };

        const dateA = getDateValue(a);
        const dateB = getDateValue(b);

        // If dates are missing, fall back to name sorting
        if (!dateA && !dateB) return a.name.localeCompare(b.name);
        if (!dateA) return 1;
        if (!dateB) return -1;

        // Sort by date (newest first)
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      categories.push({
        id: categoryId,
        name: `${categoryName} Lists`,
        type: "lists",
        playlists: sortedPlaylists,
      });
    }

    return categories;
  };

  // Initialize with playlists from props
  useEffect(() => {
    if (initialPlaylists.length > 0) {
      // Use playlists from props (already loaded by parent with Quick Notes from DB)
      setPlaylists(initialPlaylists.map((p) => ({ ...p, status: undefined })));
      setLoading(false);
      setError(null); // Clear any previous errors
    }
  }, [initialPlaylists]);

  // Update loading and error states when props change
  useEffect(() => {
    setLoading(initialLoading);
  }, [initialLoading]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const handleRefreshClick = async () => {
    // Check what playlists would be deleted BEFORE showing confirmation
    try {
      // Get current database playlists
      const databasePlaylists = await db.playlists.toArray();

      // Get current ftrack playlists
      const [reviewSessions, lists] = await Promise.all([
        ftrackService.getPlaylists(selectedProjectId),
        ftrackService.getLists(selectedProjectId),
      ]);
      const fetchedPlaylists = [...reviewSessions, ...lists];

      // Find playlists that would be deleted (exist in DB but not in ftrack)
      const ftrackPlaylistIds = new Set(fetchedPlaylists.map((fp) => fp.id));
      const orphanedPlaylists = databasePlaylists.filter((dbPlaylist) => {
        // Skip local-only playlists (no ftrackId) - they're never orphaned
        if (!dbPlaylist.ftrackId) {
          return false;
        }

        // Skip playlists from other projects - they're not orphaned, just filtered
        if (
          selectedProjectId &&
          dbPlaylist.projectId &&
          dbPlaylist.projectId !== selectedProjectId
        ) {
          return false;
        }

        // Only consider orphaned if it was synced to current project but no longer exists there
        return !ftrackPlaylistIds.has(dbPlaylist.ftrackId);
      });

      setPlaylistsToDelete(
        orphanedPlaylists.map((p) => ({ id: p.id, name: p.name })),
      );
      setShowRefreshConfirm(true);
    } catch (error) {
      console.error("Failed to check for playlists to delete:", error);
      // Still show confirmation even if check failed
      setPlaylistsToDelete([]);
      setShowRefreshConfirm(true);
    }
  };

  const handleConfirmRefresh = async () => {
    setShowRefreshConfirm(false);
    setIsRefreshing(true);
    try {
      // Use parent refresh function if available for proper state synchronization
      let refreshResult;
      if (onRefresh) {
        console.debug(
          "[PlaylistPanel] Using parent refresh function for proper state sync",
        );
        await onRefresh(); // This will update store and trigger App.tsx re-render

        // Check if active playlist was deleted and redirect to Quick Notes if needed
        const { playlists: freshPlaylists } = usePlaylistsStore.getState();
        const activePlaylistStillExists = freshPlaylists.some(
          (p) => p.id === activePlaylist,
        );

        if (
          activePlaylist &&
          !activePlaylistStillExists &&
          activePlaylist !== "quick-notes"
        ) {
          console.debug(
            "[PlaylistPanel] Active playlist was deleted during refresh, redirecting to Quick Notes",
          );
          onPlaylistSelect("quick-notes");
        }

        // Note: Parent refresh updates the store, and new props will flow down via useEffect
        return; // Exit early, let props update handle the rest
      } else {
        console.debug("[PlaylistPanel] Using fallback direct store refresh");
        refreshResult = await loadPlaylists();
      }

      // Check if any playlists were deleted during refresh (fallback path only)
      if (
        refreshResult.deletedPlaylists &&
        refreshResult.deletedPlaylists.length > 0
      ) {
        console.debug(
          "[PlaylistPanel] Playlists were deleted during refresh:",
          {
            count: refreshResult.deletedPlaylists.length,
            names: refreshResult.deletedPlaylists.map((p) => p.name),
          },
        );

        // Check if the active playlist was deleted and redirect if needed
        const wasActivePlaylistDeleted = refreshResult.deletedPlaylists.some(
          (deleted) => deleted.id === activePlaylist,
        );

        if (wasActivePlaylistDeleted) {
          onPlaylistSelect("quick-notes");
        }

        // Store deletion info for simple notification dialog
        setDeletedPlaylistsInfo({
          playlists: refreshResult.deletedPlaylists,
        });

        // Show the deleted playlists notification
        setShowDeletedPlaylistsAlert(true);
      }

      // Get the updated playlists from the store
      const { playlists: updatedStorePlaylists } = usePlaylistsStore.getState();
      const latestPlaylists = updatedStorePlaylists;

      console.debug("[PlaylistPanel] Store playlists after loadPlaylists:", {
        storeCount: latestPlaylists.length,
        localCount: playlists.length,
      });

      // Filter out deleted playlists from local state
      let filteredLatestPlaylists = latestPlaylists;
      if (
        refreshResult.deletedPlaylists &&
        refreshResult.deletedPlaylists.length > 0
      ) {
        const deletedIds = new Set(
          refreshResult.deletedPlaylists.map((d) => d.id),
        );
        filteredLatestPlaylists = latestPlaylists.filter(
          (p) => !deletedIds.has(p.id),
        );
      }

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
      const processedPlaylists = filteredLatestPlaylists
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
            return {
              ...preservedData,
              ...latest,
              status: undefined,
            } as PlaylistWithStatus;
          }
          // If it's new, mark it as added
          if (!current) {
            console.debug("[PlaylistPanel] Found new playlist:", latest.name);
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

      // Find removed playlists (excluding Quick Notes and deleted ones)
      const removedPlaylists = playlists
        .filter(
          (p) =>
            !p.isQuickNotes && // Never remove Quick Notes
            p.status !== "removed" && // Don't re-mark already removed playlists
            !filteredLatestPlaylists.some((l) => l.id === p.id) &&
            !(
              refreshResult.deletedPlaylists &&
              refreshResult.deletedPlaylists.some((d) => d.id === p.id)
            ), // Don't mark deleted playlists as "removed"
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
          return existing
            ? { ...existing, ...p, status: "removed" as const }
            : p;
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
      const allPlaylistsForStore = [
        ...processedPlaylists,
        ...removedPlaylists,
        ...existingRemovedPlaylists,
      ].map((p) => {
        const { status, ...cleanPlaylist } = p as any;
        return cleanPlaylist;
      });

      // Update store to maintain consistency (fallback path only)
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
      .filter((p) => !p.isQuickNotes && p.status !== "removed") // Only non-Quick Notes, non-removed playlists
      .map((p) => {
        const { status, ...cleanPlaylist } = p as any;
        const existing = storePlaylistMap.get(p.id);
        // Preserve existing data (like versions) if available
        return existing ? { ...existing, ...cleanPlaylist } : cleanPlaylist;
      });

    setStorePlaylists(cleanPlaylists);
  };

  const handleCreatePlaylist = () => {
    setShowCreateDialog(true);
  };

  const handleCreateSuccess = (playlist: Playlist) => {
    // Add the new playlist to local state with "added" status
    const newPlaylistWithStatus: PlaylistWithStatus = {
      ...playlist,
      status: "added" as const,
    };

    setPlaylists((prev) => [
      ...prev.filter((p) => p.id !== playlist.id), // Remove if exists
      newPlaylistWithStatus,
    ]);

    // Add to store as well
    const { playlists: storePlaylists } = usePlaylistsStore.getState();
    const updatedStorePlaylists = [
      ...storePlaylists.filter((p) => p.id !== playlist.id), // Remove if exists
      playlist,
    ];
    setStorePlaylists(updatedStorePlaylists);

    // Auto-select the new playlist
    onPlaylistSelect(playlist.id);

    setShowCreateDialog(false);
  };

  const handleCreateClose = () => {
    setShowCreateDialog(false);
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

  // Check if we should show empty state
  const shouldShowEmptyState =
    !selectedProjectId || !hasValidatedSelectedProject;

  return (
    <div className="w-72 border-r p-4 relative flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-lg font-bold">Playlists</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreatePlaylist}
            disabled={shouldShowEmptyState}
            className="h-8 w-8 p-0"
            title="Create new playlist"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshClick}
            disabled={isRefreshing || shouldShowEmptyState}
            className={cn("h-8 w-8 p-0", isRefreshing)}
            title="Refresh playlists"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {shouldShowEmptyState ? (
        <PlaylistPanelEmptyState />
      ) : (
        <>
          {/* Quick Notes section - fixed at the top */}
          {quickNotesPlaylist && (
            <div className="shrink-0">
              <Button
                variant={
                  activePlaylist === quickNotesPlaylist.id
                    ? "default"
                    : "outline"
                }
                size="lg"
                onClick={() => onPlaylistSelect(quickNotesPlaylist.id)}
                className="w-full justify-start text-left mb-1"
              >
                <span className="truncate flex-1">
                  {quickNotesPlaylist.title}
                </span>
              </Button>
              <hr className="my-4 border-zinc-200 dark:border-zinc-700" />
            </div>
          )}

          {/* Scrollable playlists section */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] relative">
              <motion.div
                className="h-full"
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
                    activePlaylist === QUICK_NOTES_ID ||
                    activePlaylist === "quick-notes"
                      ? null
                      : activePlaylist
                  }
                />
              </motion.div>

              {/* Subtle fade to hint at scrollability - positioned above the footer */}
              <div className="absolute bottom-8 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            </div>
          </div>
        </>
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

      <CreatePlaylistDialog
        isOpen={showCreateDialog}
        onClose={handleCreateClose}
        onSuccess={handleCreateSuccess}
        projectId={selectedProjectId || undefined}
      />

      {/* Pre-refresh confirmation dialog */}
      <AlertDialog
        open={showRefreshConfirm}
        onOpenChange={setShowRefreshConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh Playlists</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will refresh all playlists from ftrack.</p>

                {playlistsToDelete.length > 0 ? (
                  <>
                    <p className="text-destructive font-medium">
                      ⚠️ The following playlist
                      {playlistsToDelete.length > 1 ? "s" : ""} will be removed
                      (deleted from ftrack):
                    </p>

                    {/* List of playlists to be deleted */}
                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/30">
                      {playlistsToDelete.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="text-xs text-muted-foreground"
                        >
                          {playlist.name}
                        </div>
                      ))}
                    </div>

                    <p className="text-sm">
                      <strong>
                        Make sure to save any work on these playlists before
                        continuing.
                      </strong>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No playlists will be removed.
                  </p>
                )}

                <p className="text-sm">
                  Do you want to proceed with the refresh?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRefresh}>
              {playlistsToDelete.length > 0
                ? "Remove & Refresh"
                : "Refresh Playlists"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Simple deleted playlists notification */}
      <AlertDialog
        open={showDeletedPlaylistsAlert}
        onOpenChange={setShowDeletedPlaylistsAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Playlists Removed</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The following playlist
                  {deletedPlaylistsInfo?.playlists &&
                  deletedPlaylistsInfo.playlists.length > 1
                    ? "s have"
                    : " has"}{" "}
                  been removed:
                </p>

                {/* Simple list of deleted playlists */}
                {deletedPlaylistsInfo?.playlists &&
                  deletedPlaylistsInfo.playlists.length > 0 && (
                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/30">
                      {deletedPlaylistsInfo.playlists.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="text-xs text-muted-foreground"
                        >
                          {playlist.name}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowDeletedPlaylistsAlert(false)}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
