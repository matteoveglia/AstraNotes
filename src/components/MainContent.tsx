/**
 * @fileoverview MainContent.tsx
 * Primary component managing playlist version display and interaction.
 * Handles version selection, note drafts, publishing, and playlist synchronization.
 * Features include note management, batch publishing, real-time updates,
 * version sorting/filtering, and FTrack service integration.
 * @component
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Playlist, AssetVersion, NoteStatus } from "@/types";
import { playlistStore } from "../store/playlist";
import { usePlaylistsStore } from "../store/playlistsStore";
import { RefreshCw, ExternalLink } from "lucide-react";
import { useSettings } from "../store/settingsStore";
import { motion, AnimatePresence } from "motion/react";
import { open } from "@tauri-apps/plugin-shell";

// Import custom hooks
import { usePlaylistModifications } from "@/features/playlists/hooks/usePlaylistModifications";
import { useNoteManagement } from "@/features/notes/hooks/useNoteManagement";
import { useThumbnailLoading } from "@/features/versions/hooks/useThumbnailLoading";
import { useLabelStore } from "../store/labelStore";

// Import components
import { ModificationsBanner } from "@/features/versions/components/ModificationsBanner";
import { PublishingControls } from "@/features/notes/components/PublishingControls";
import { VersionGrid } from "@/features/versions/components/VersionGrid";
import { SearchPanel } from "@/features/versions/components/SearchPanel";
import { VersionFilter } from "@/features/versions/components/VersionFilter";
import { SyncPlaylistButton } from "@/features/playlists/components/SyncPlaylistButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface MainContentProps {
  playlist: Playlist;
  onPlaylistUpdate?: (playlist: Playlist) => void;
}

export const MainContent: React.FC<MainContentProps> = ({
  playlist,
  onPlaylistUpdate,
}) => {
  // Simplified state management - remove complex merging logic
  const [isInitializing, setIsInitializing] = useState(true);
  const [activePlaylist, setActivePlaylist] = useState<Playlist>(playlist);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );

  // Filter state
  const [selectedStatuses, setSelectedStatuses] = useState<NoteStatus[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  // Ref for cleanup tracking
  const cleanupRef = useRef<(() => void) | null>(null);
  const initializationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hover state for playlist title
  const [isPlaylistTitleHovered, setIsPlaylistTitleHovered] = useState(false);

  // Memoize playlist initialization to prevent unnecessary re-initializations
  const initializePlaylist = useCallback(async (playlistToInit: Playlist) => {
    const playlistId = playlistToInit.id;
    console.debug(
      `[MainContent] Starting initialization for playlist ${playlistId}`,
    );

    // Clear any existing timeout
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }

    // Set a reasonable timeout for initialization
    initializationTimeoutRef.current = setTimeout(() => {
      console.warn(
        `[MainContent] Initialization timeout for playlist ${playlistId}`,
      );
      setInitializationError(
        `Initialization timeout for playlist: ${playlistToInit.name}`,
      );
      setIsInitializing(false);
    }, 10000); // 10 second timeout

    try {
      setIsInitializing(true);
      setInitializationError(null);

      // Stop any existing polling immediately
      playlistStore.stopPolling();

      // For local playlists (both pending and synced), skip ftrack initialization and use versions directly
      if (playlistToInit.isLocalOnly || playlistId.startsWith("local_")) {
        console.debug(
          `[MainContent] Local playlist detected, skipping ftrack initialization`,
          {
            playlistId,
            isLocalOnly: playlistToInit.isLocalOnly,
            versionsCount: playlistToInit.versions?.length || 0,
            versions: playlistToInit.versions?.map((v) => ({
              id: v.id,
              name: v.name,
            })),
          },
        );
        // Just cache the playlist with its existing versions, using cleanPlaylistForStorage to convert
        const cachedPlaylist =
          playlistStore.cleanPlaylistForStorage(playlistToInit);
        console.debug(
          `[MainContent] Cached playlist versions:`,
          cachedPlaylist.versions?.length || 0,
        );
        await playlistStore.cachePlaylist(cachedPlaylist);
      } else {
        // Initialize the playlist in store with error handling
        await playlistStore.initializePlaylist(playlistId, playlistToInit);
      }

      // Get the cached/merged version with proper data from IndexedDB
      const cached = await playlistStore.getPlaylist(playlistId);

      // Update the active playlist with cached data if available
      const finalPlaylist = cached
        ? {
            ...playlistToInit,
            versions: cached.versions || [],
          }
        : playlistToInit;

      console.debug(
        `[MainContent] Setting active playlist for ${playlistId}:`,
        {
          originalVersionsCount: playlistToInit.versions?.length || 0,
          cachedVersionsCount: cached?.versions?.length || 0,
          finalVersionsCount: finalPlaylist.versions?.length || 0,
          isLocalOnly: playlistToInit.isLocalOnly,
          originalVersions: playlistToInit.versions?.map((v) => ({
            id: v.id,
            name: v.name,
          })),
          cachedVersions: cached?.versions?.map((v) => ({
            id: v.id,
            name: v.name,
          })),
          finalVersions: finalPlaylist.versions?.map((v) => ({
            id: v.id,
            name: v.name,
          })),
        },
      );

      console.debug(
        `[MainContent] About to call setActivePlaylist for ${playlistId}`,
      );
      setActivePlaylist(finalPlaylist);
      console.debug(`[MainContent] Called setActivePlaylist for ${playlistId}`);

      // Clear timeout on successful completion
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }

      console.debug(
        `[MainContent] Initialization completed successfully for ${playlistId}`,
      );
    } catch (error) {
      console.error(
        `[MainContent] Failed to initialize playlist ${playlistId}:`,
        error,
      );
      setInitializationError(
        `Failed to initialize playlist: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Still set the playlist even if initialization failed
      setActivePlaylist(playlistToInit);
    } finally {
      setIsInitializing(false);
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
    }
  }, []);

  // Effect for playlist initialization when playlist ID changes
  useEffect(() => {
    console.debug(`[MainContent] Playlist prop changed, ID: ${playlist.id}`);

    // Reset state immediately when playlist changes
    setActivePlaylist(playlist);
    setInitializationError(null);

    // Initialize the new playlist
    initializePlaylist(playlist);

    // Store cleanup function
    cleanupRef.current = () => {
      console.debug(`[MainContent] Cleaning up for playlist ${playlist.id}`);
      playlistStore.stopPolling();
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }
    };

    // Cleanup when playlist changes or component unmounts
    return cleanupRef.current;
  }, [playlist.id, initializePlaylist]);

  // Use custom hooks
  const { settings } = useSettings();
  const { fetchLabels } = useLabelStore();
  const {
    modifications,
    isRefreshing,
    pendingVersions,
    applyPendingChanges,
    refreshPlaylist,
  } = usePlaylistModifications(activePlaylist, onPlaylistUpdate);

  const {
    selectedVersions,
    noteStatuses,
    noteDrafts,
    noteLabelIds,
    noteAttachments,
    isPublishing,
    saveNoteDraft,
    clearNoteDraft,
    toggleVersionSelection,
    publishSelectedNotes,
    publishAllNotes,
    clearAllNotes,
    setAllLabels,
    getDraftCount,
    clearAllSelections,
  } = useNoteManagement(activePlaylist);

  const { thumbnails } = useThumbnailLoading(activePlaylist.versions || []);

  // Fetch labels when component mounts
  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  // Auto-refresh polling based on settings - simplified logic
  useEffect(() => {
    // Don't poll for Quick Notes playlist or during initialization
    if (activePlaylist.isQuickNotes || isInitializing) return;

    if (!settings.autoRefreshEnabled) {
      playlistStore.stopPolling();
      return;
    }

    // Only start polling after initialization is complete
    const startPollingWithDelay = async () => {
      // Small delay to ensure initialization is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.debug(
        `[MainContent] Starting polling for playlist ${activePlaylist.id}`,
      );
      try {
        await playlistStore.startPolling(
          activePlaylist.id,
          (added, removed, addedVersions, removedVersions, freshVersions) => {
            console.debug(
              `[MainContent] Polling detected changes: +${added}, -${removed}`,
            );
            // Changes are handled by the usePlaylistModifications hook
          },
        );
      } catch (error) {
        console.error(`[MainContent] Failed to start polling:`, error);
      }
    };

    startPollingWithDelay();

    // Stop polling when dependencies change
    return () => {
      console.debug(
        `[MainContent] Stopping polling for playlist ${activePlaylist.id}`,
      );
      playlistStore.stopPolling();
    };
  }, [
    activePlaylist.id,
    activePlaylist.isQuickNotes,
    settings.autoRefreshEnabled,
    isInitializing, // Add this dependency
  ]);

  // Synchronize activePlaylist when playlist prop updates (e.g., after applying changes)
  useEffect(() => {
    // Only update if the versions have actually changed and we're not initializing
    if (!isInitializing && playlist.id === activePlaylist.id) {
      const currentVersionCount = activePlaylist.versions?.length || 0;
      const newVersionCount = playlist.versions?.length || 0;

      if (currentVersionCount !== newVersionCount) {
        console.debug(
          `[MainContent] Synchronizing playlist versions for ${playlist.id}:`,
          { currentCount: currentVersionCount, newCount: newVersionCount },
        );
        setActivePlaylist(playlist);
      }
    }
  }, [
    playlist.versions,
    playlist.id,
    activePlaylist.id,
    activePlaylist.versions?.length,
    isInitializing,
  ]);

  // Unified function to handle removing versions from playlist
  const handleRemoveVersions = async (
    versionIds: string[] | 'all-manually-added'
  ) => {
    if (!activePlaylist.id) return;

    try {
      let versionsToRemove: string[];
      
      if (versionIds === 'all-manually-added') {
        // Get all manually added version IDs
        versionsToRemove = activePlaylist.versions
          ?.filter((v) => v.manuallyAdded)
          .map((v) => v.id) || [];
      } else {
        versionsToRemove = versionIds;
      }

      if (versionsToRemove.length === 0) return;

      // Remove versions from the database
      for (const versionId of versionsToRemove) {
        await playlistStore.removeVersionFromPlaylist(activePlaylist.id, versionId);
      }

      // Update the UI by filtering out removed versions
      const updatedVersions = activePlaylist.versions?.filter(
        (v) => !versionsToRemove.includes(v.id)
      ) || [];
      
      const updatedPlaylist = {
        ...activePlaylist,
        versions: updatedVersions,
        // Clear addedVersions array if we removed all manually added
        ...(versionIds === 'all-manually-added' && { addedVersions: [] }),
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Update the local state as well to ensure immediate UI update
      setActivePlaylist(updatedPlaylist);

      // Clear note drafts for all removed versions
      for (const versionId of versionsToRemove) {
        await clearNoteDraft(versionId);
      }
      
      console.log(`Successfully removed ${versionsToRemove.length} version(s) from playlist`);
    } catch (error) {
      console.error("Failed to remove versions:", error);
    }
  };

  // Wrapper functions for backwards compatibility and clarity
  const handleClearAdded = () => handleRemoveVersions('all-manually-added');
  const handleRemoveVersion = (versionId: string) => handleRemoveVersions([versionId]);

  const handleClearAll = () => {
    console.log("handleClearAll called:", {
      isQuickNotes: activePlaylist.isQuickNotes,
      versionsCount: activePlaylist.versions?.length || 0,
      playlistId: activePlaylist.id,
    });

    if (!activePlaylist.isQuickNotes) {
      console.log("Not Quick Notes, skipping clear");
      return;
    }

    // Clear all versions from the playlist
    const updatedPlaylist = {
      ...activePlaylist,
      versions: [],
    };

    console.log("Clearing Quick Notes versions, calling onPlaylistUpdate:", {
      hasCallback: !!onPlaylistUpdate,
      playlistName: updatedPlaylist.name,
      newVersionsCount: updatedPlaylist.versions.length,
    });

    // Update the playlist in the store
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
      console.log("Quick Notes onPlaylistUpdate called successfully");
    } else {
      console.warn(
        "No onPlaylistUpdate callback available to clear Quick Notes",
      );
    }
  };

  const handleVersionSelect = async (version: AssetVersion) => {
    try {
      if (!activePlaylist.id) return;

      // Check if the version already exists in the playlist
      const versionExists = activePlaylist.versions?.some(
        (v) => v.id === version.id,
      );
      if (versionExists) {
        console.log(
          `Version ${version.id} already exists in playlist ${activePlaylist.id}, skipping`,
        );
        return;
      }

      // Mark the version as manually added
      const versionWithFlag: AssetVersion = {
        ...version,
        manuallyAdded: true,
      };

      // Add to the database first to ensure it exists
      await playlistStore.addVersionToPlaylist(
        activePlaylist.id,
        versionWithFlag,
      );

      // Then update the UI
      const updatedVersions = [
        ...(activePlaylist.versions || []),
        versionWithFlag,
      ];

      const updatedPlaylist = {
        ...activePlaylist,
        versions: updatedVersions,
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Update the local state as well
      setActivePlaylist(updatedPlaylist);
    } catch (error) {
      console.error("Failed to add version to playlist:", error);
    }
  };

  const handleVersionsSelect = async (versions: AssetVersion[]) => {
    try {
      if (!activePlaylist.id) return;

      // Track successfully added versions
      let addedCount = 0;
      const newVersions: AssetVersion[] = [];

      // Create a set of existing version IDs for quick lookup
      const existingVersionIds = new Set(
        activePlaylist.versions?.map((v) => v.id) || [],
      );

      // Process each version
      for (const version of versions) {
        // Skip if already exists
        if (existingVersionIds.has(version.id)) {
          console.log(
            `Version ${version.id} already exists in playlist ${activePlaylist.id}, skipping`,
          );
          continue;
        }

        // Mark the version as manually added
        const versionWithFlag: AssetVersion = {
          ...version,
          manuallyAdded: true,
        };

        try {
          // Add to the database
          await playlistStore.addVersionToPlaylist(
            activePlaylist.id,
            versionWithFlag,
          );

          // Add to our list of new versions
          newVersions.push(versionWithFlag);
          addedCount++;
        } catch (error) {
          console.error(
            `Failed to add version ${version.id} to playlist:`,
            error,
          );
        }
      }

      // If we added any versions, update the UI
      if (addedCount > 0) {
        // Then update the UI
        const updatedVersions = [
          ...(activePlaylist.versions || []),
          ...newVersions,
        ];

        const updatedPlaylist = {
          ...activePlaylist,
          versions: updatedVersions,
        };

        // Update the playlist in the store
        if (onPlaylistUpdate) {
          onPlaylistUpdate(updatedPlaylist);
        }

        // Update the local state as well
        setActivePlaylist(updatedPlaylist);

        console.log(
          `Successfully added ${addedCount} versions to playlist ${activePlaylist.id}`,
        );
      }
    } catch (error) {
      console.error("Failed to add multiple versions to playlist:", error);
    }
  };

  // Memoize sorted versions to prevent unnecessary re-renders
  const sortedVersions = useMemo(() => {
    console.log("[MainContent] Computing sortedVersions:", {
      isInitializing,
      playlistId: activePlaylist.id,
      versionsCount: activePlaylist.versions?.length || 0,
      versions:
        activePlaylist.versions
          ?.slice(0, 3)
          .map((v) => ({ id: v.id, name: v.name })) || [],
    });

    if (isInitializing) {
      console.log("[MainContent] Still initializing, returning empty array");
      return [];
    }

    let filteredVersions = [...(activePlaylist.versions || [])];
    console.log(
      "[MainContent] After copying versions:",
      filteredVersions.length,
    );

    // Apply status filter
    if (selectedStatuses.length > 0) {
      filteredVersions = filteredVersions.filter((version) => {
        const status = noteStatuses[version.id] || "empty";

        // Check if any selected status matches
        for (const selectedStatus of selectedStatuses) {
          if (selectedStatus === "reviewed") {
            // Handle "reviewed" as "Selected" - check if version is in selectedVersions
            if (selectedVersions.includes(version.id)) {
              return true;
            }
          } else {
            // Regular status check
            if (status === selectedStatus) {
              return true;
            }
          }
        }

        return false;
      });
    }

    // Apply label filter
    if (selectedLabels.length > 0) {
      filteredVersions = filteredVersions.filter((version) => {
        const labelId = noteLabelIds[version.id];
        return labelId && selectedLabels.includes(labelId);
      });
    }

    // Sort the filtered versions
    const sorted = filteredVersions.sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by version number
      return a.version - b.version;
    });

    console.log("[MainContent] Final sorted versions:", sorted.length);
    return sorted;
  }, [
    activePlaylist.versions,
    isInitializing,
    selectedStatuses,
    selectedLabels,
    noteStatuses,
    noteLabelIds,
    selectedVersions,
  ]);

  const handleClearFilters = () => {
    setSelectedStatuses([]);
    setSelectedLabels([]);
  };

  // Handler to open playlist in ftrack
  const handleOpenPlaylistInFtrack = async () => {
    // NEW: Handle local playlists properly
    if (activePlaylist.id.startsWith("local_") || activePlaylist.isLocalOnly) {
      console.log("Cannot open local playlist in ftrack - not yet synced");
      return;
    }

    const baseUrl = settings.serverUrl.replace(/\/$/, "");
    if (!baseUrl) return;

    // CRITICAL FIX for Issue #4: Use ftrackId for synced playlists, not the UUID
    let ftrackEntityId = activePlaylist.id; // Default fallback

    if (activePlaylist.ftrackSyncState === "synced") {
      // For synced playlists, get the ftrack ID from the database
      try {
        const ftrackId = await playlistStore.getFtrackId(activePlaylist.id);
        if (ftrackId) {
          ftrackEntityId = ftrackId;
          console.log(
            `[MainContent] Using ftrack ID ${ftrackId} for synced playlist ${activePlaylist.id}`,
          );
        } else {
          console.warn(
            `[MainContent] No ftrack ID found for synced playlist ${activePlaylist.id}, using UUID as fallback`,
          );
        }
      } catch (error) {
        console.error(
          `[MainContent] Failed to get ftrack ID for playlist ${activePlaylist.id}:`,
          error,
        );
      }
    }

    // Determine entity type based on playlist type
    const entityType =
      activePlaylist.type === "reviewsession" ? "reviewsession" : "list";

    const url = `${baseUrl}/#entityId=${ftrackEntityId}&entityType=${entityType}&itemId=projects&view=versions_v1`;
    console.log(`[MainContent] Opening ftrack URL: ${url}`);
    open(url);
  };

  const handleSyncSuccess = async (playlistId: string) => {
    console.log("handleSyncSuccess called for synced playlist ID:", playlistId);

    // Get the actual ftrack ID from the database after sync
    let actualFtrackId: string | null = null;
    try {
      actualFtrackId = await playlistStore.getFtrackId(playlistId);
      console.log("Retrieved ftrack ID after sync:", {
        playlistId,
        actualFtrackId,
      });
    } catch (error) {
      console.error("Failed to get ftrack ID after sync:", error);
    }

    // The playlist was converted in place, so we just update the local state to reflect sync
    const updatedPlaylist = {
      ...activePlaylist,
      // Keep the same ID since playlist was converted in place
      isLocalOnly: false,
      ftrackSyncState: "synced" as const,
      // Clear manually added flags from versions to remove purple borders
      versions:
        activePlaylist.versions?.map((v) => ({
          ...v,
          manuallyAdded: false,
        })) || [],
    };

    setActivePlaylist(updatedPlaylist);

    // Update parent component state
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
    }

    // Notify App component that sync is complete (no navigation needed since same ID)
    window.dispatchEvent(
      new CustomEvent("playlist-synced", {
        detail: {
          playlistId: activePlaylist.id,
          ftrackId: actualFtrackId, // Use actual ftrack ID from database
          playlistName: activePlaylist.name,
        },
      }),
    );

    console.log(
      "Sync success handling completed - playlist converted in place:",
      {
        playlistId,
        actualFtrackId,
        playlistName: activePlaylist.name,
      },
    );
  };

  const handleSyncError = (error: string) => {
    console.error("Sync error:", error);
    // Could show a toast notification here
  };

  const handlePlaylistCreated = async (playlist: Playlist) => {
    console.log("handlePlaylistCreated called with playlist:", {
      id: playlist.id,
      name: playlist.name,
      versionsCount: playlist.versions?.length || 0,
      isLocalOnly: playlist.isLocalOnly,
      versions: playlist.versions?.map((v) => ({ id: v.id, name: v.name })),
    });

    // Clear Quick Notes since we're moving the versions to a new playlist
    if (activePlaylist.isQuickNotes) {
      console.log("Clearing Quick Notes versions after playlist creation");
      try {
        // Clear both local state and notify parent
        const clearedQuickNotes = {
          ...activePlaylist,
          versions: [],
        };
        setActivePlaylist(clearedQuickNotes);

        if (onPlaylistUpdate) {
          onPlaylistUpdate(clearedQuickNotes);
        }

        console.log("Quick Notes cleared successfully");
      } catch (error) {
        console.error("Failed to clear Quick Notes:", error);
      }
    }

    // Add the new playlist to the store
    const { playlists: storePlaylists, setPlaylists: setStorePlaylists } =
      usePlaylistsStore.getState();
    const updatedStorePlaylists = [
      ...storePlaylists.filter((p) => p.id !== playlist.id), // Remove if exists
      playlist,
    ];
    setStorePlaylists(updatedStorePlaylists);

    // Notify parent component (App) about the new playlist to trigger playlist panel refresh
    if (onPlaylistUpdate) {
      onPlaylistUpdate(playlist);
    }

    // Auto-navigate to the new playlist using App's navigation system
    console.log("Starting auto-navigation to new playlist:", {
      newPlaylistId: playlist.id,
      newPlaylistName: playlist.name,
      usingAppNavigation: true,
    });

    try {
      // Use a small delay to ensure the playlist is fully added to the state first
      setTimeout(() => {
        // Trigger playlist selection through the App's handlePlaylistSelect
        // This ensures both the activePlaylistId and openPlaylists are updated properly
        const playlistSelectEvent = new CustomEvent("playlist-select", {
          detail: { playlistId: playlist.id },
        });
        window.dispatchEvent(playlistSelectEvent);
        console.log("Auto-navigation event dispatched successfully");
      }, 100);
    } catch (error) {
      console.error("Auto-navigation failed:", error);
    }

    console.log("Playlist created from Quick Notes:", playlist.name);
  };

  // Show initialization error if it exists
  if (initializationError) {
    return (
      <Card className="h-full flex flex-col rounded-none">
        <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <CardTitle className="text-xl text-red-600">
                Error Loading Playlist
              </CardTitle>
              <div
                className="flex items-center gap-2 group"
                onMouseEnter={() => setIsPlaylistTitleHovered(true)}
                onMouseLeave={() => setIsPlaylistTitleHovered(false)}
              >
                <p className="text-sm text-muted-foreground">
                  {activePlaylist.name}
                  {activePlaylist.isLocalOnly && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-2 cursor-help">• Local only</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            This playlist is local only and not synced to
                            ftrack. Use the sync button to push it to ftrack.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </p>
                <AnimatePresence>
                  {isPlaylistTitleHovered &&
                    !activePlaylist.isQuickNotes &&
                    !activePlaylist.isLocalOnly && (
                      <motion.div
                        initial={{ opacity: 0, x: -10, scale: 1 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -10, scale: 1 }}
                        transition={{ duration: 0.1, ease: "easeOut" }}
                        onClick={handleOpenPlaylistInFtrack}
                        className="cursor-pointer"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInitializationError(null);
                initializePlaylist(playlist);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-lg font-medium text-red-600">
              Failed to Initialize Playlist
            </div>
            <div className="text-sm text-muted-foreground max-w-md">
              {initializationError}
            </div>
            <Button
              variant="default"
              onClick={() => {
                setInitializationError(null);
                initializePlaylist(playlist);
              }}
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col rounded-none">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <div
              className="flex items-center gap-2 group"
              onMouseEnter={() => setIsPlaylistTitleHovered(true)}
              onMouseLeave={() => setIsPlaylistTitleHovered(false)}
            >
              <CardTitle className="text-xl">
                {activePlaylist.name}
                {isInitializing && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (Loading...)
                  </span>
                )}
              </CardTitle>
              <AnimatePresence>
                {isPlaylistTitleHovered &&
                  !isInitializing &&
                  !activePlaylist.isQuickNotes &&
                  !activePlaylist.isLocalOnly && (
                    <motion.div
                      initial={{ opacity: 0, x: -10, scale: 1 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 1 }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      onClick={handleOpenPlaylistInFtrack}
                      className="cursor-pointer"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>
            <p className="text-sm text-muted-foreground">
              {isInitializing ? (
                "Initializing playlist..."
              ) : (
                <>
                  {sortedVersions.length} Version
                  {sortedVersions.length !== 1 ? "s" : ""}
                  {(selectedStatuses.length > 0 || selectedLabels.length > 0) &&
                    ` (${activePlaylist.versions?.length || 0} total)`}
                  {activePlaylist.isLocalOnly && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-2 cursor-help">• Local only</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            This playlist is local only and not synced to
                            ftrack. Use the sync button to push it to ftrack.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!isInitializing &&
          (modifications.added > 0 || modifications.removed > 0) ? (
            <ModificationsBanner
              addedCount={modifications.added}
              removedCount={modifications.removed}
              onUpdate={applyPendingChanges}
              isUpdating={isRefreshing}
              addedVersions={
                pendingVersions?.filter((v) =>
                  modifications.addedVersions?.includes(v.id),
                ) || []
              }
              removedVersions={
                activePlaylist.versions?.filter((v) =>
                  modifications.removedVersions?.includes(v.id),
                ) || []
              }
            />
          ) : null}
          <div className="flex items-center gap-2">
            {/* Show sync button for local playlists with content (but NEVER for Quick Notes) */}
            {(() => {
              // CRITICAL FIX: Quick Notes should NEVER show sync button
              if (activePlaylist.isQuickNotes) return false;

              const hasVersionsToSync =
                (activePlaylist.versions?.length || 0) > 0;
              const hasManuallyAdded =
                activePlaylist.versions?.some((v) => v.manuallyAdded) || false;
              const shouldShowSync =
                activePlaylist.isLocalOnly &&
                activePlaylist.ftrackSyncState === "pending" &&
                (hasVersionsToSync || hasManuallyAdded);

              console.log("Sync button condition check:", {
                playlistId: activePlaylist.id,
                isQuickNotes: activePlaylist.isQuickNotes,
                isLocalOnly: activePlaylist.isLocalOnly,
                ftrackSyncState: activePlaylist.ftrackSyncState,
                hasVersionsToSync,
                hasManuallyAdded,
                shouldShowSync,
                versionsCount: activePlaylist.versions?.length || 0,
              });
              return shouldShowSync;
            })() && (
              <SyncPlaylistButton
                playlist={activePlaylist}
                versionsToSync={activePlaylist.versions || []}
                onSyncSuccess={handleSyncSuccess}
                onSyncError={handleSyncError}
              />
            )}
            <PublishingControls
              selectedCount={selectedVersions.length}
              draftCount={getDraftCount()}
              isPublishing={isPublishing}
              onPublishSelected={publishSelectedNotes}
              onPublishAll={publishAllNotes}
              onClearAllNotes={clearAllNotes}
              onSetAllLabels={setAllLabels}
              onClearAllSelections={clearAllSelections}
              isQuickNotes={Boolean(activePlaylist.isQuickNotes)}
              isRefreshing={isRefreshing}
              onRefresh={refreshPlaylist}
              selectedStatuses={selectedStatuses}
              selectedLabels={selectedLabels}
              selectedVersions={selectedVersions}
              onStatusChange={setSelectedStatuses}
              onLabelChange={setSelectedLabels}
              onClearFilters={handleClearFilters}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-5">
        {isInitializing ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <div className="text-sm text-muted-foreground">
                Loading playlist data...
              </div>
            </div>
          </div>
        ) : (
          <VersionGrid
            versions={sortedVersions}
            thumbnails={thumbnails}
            noteStatuses={noteStatuses}
            selectedVersions={selectedVersions}
            noteDrafts={noteDrafts}
            noteLabelIds={noteLabelIds}
            noteAttachments={noteAttachments}
            onSaveNote={saveNoteDraft}
            onClearNote={clearNoteDraft}
            onToggleSelection={toggleVersionSelection}
            onRemoveVersion={handleRemoveVersion}
          />
        )}
      </CardContent>

      {!isInitializing && (
        <SearchPanel
          onVersionSelect={handleVersionSelect}
          onVersionsSelect={handleVersionsSelect}
          onClearAdded={handleClearAdded}
          hasManuallyAddedVersions={Boolean(
            activePlaylist.versions?.some((v) => v.manuallyAdded),
          )}
          isQuickNotes={Boolean(activePlaylist.isQuickNotes)}
          currentVersions={activePlaylist.versions || []}
          onPlaylistCreated={handlePlaylistCreated}
        />
      )}
    </Card>
  );
};
