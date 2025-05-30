/**
 * @fileoverview MainContent.tsx
 * Primary component managing playlist version display and interaction.
 * Handles version selection, note drafts, publishing, and playlist synchronization.
 * Features include note management, batch publishing, real-time updates,
 * version sorting/filtering, and FTrack service integration.
 * @component
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Playlist, AssetVersion, NoteStatus } from "@/types";
import { playlistStore } from "../store/playlistStore";
import { RefreshCw } from "lucide-react";
import { useSettings } from "../store/settingsStore";

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
  const [initializationError, setInitializationError] = useState<string | null>(null);

  // Filter state
  const [selectedStatuses, setSelectedStatuses] = useState<NoteStatus[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  // Ref for cleanup tracking
  const cleanupRef = useRef<(() => void) | null>(null);
  const initializationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize playlist initialization to prevent unnecessary re-initializations
  const initializePlaylist = useCallback(async (playlistToInit: Playlist) => {
    const playlistId = playlistToInit.id;
    console.debug(`[MainContent] Starting initialization for playlist ${playlistId}`);
    
    // Clear any existing timeout
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
      initializationTimeoutRef.current = null;
    }

    // Set a reasonable timeout for initialization
    initializationTimeoutRef.current = setTimeout(() => {
      console.warn(`[MainContent] Initialization timeout for playlist ${playlistId}`);
      setInitializationError(`Initialization timeout for playlist: ${playlistToInit.name}`);
      setIsInitializing(false);
    }, 10000); // 10 second timeout

    try {
      setIsInitializing(true);
      setInitializationError(null);
      
      // Stop any existing polling immediately
      playlistStore.stopPolling();

      // Initialize the playlist in store with error handling
      await playlistStore.initializePlaylist(playlistId, playlistToInit);

      // Get the cached/merged version with proper data from IndexedDB
      const cached = await playlistStore.getPlaylist(playlistId);
      
      // Update the active playlist with cached data if available
      const finalPlaylist = cached ? {
        ...playlistToInit,
        versions: cached.versions || [],
      } : playlistToInit;

      console.debug(`[MainContent] Setting active playlist for ${playlistId}:`, {
        originalVersionsCount: playlistToInit.versions?.length || 0,
        cachedVersionsCount: cached?.versions?.length || 0,
        finalVersionsCount: finalPlaylist.versions?.length || 0
      });

      setActivePlaylist(finalPlaylist);
      
      // Clear timeout on successful completion
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = null;
      }

    } catch (error) {
      console.error(`[MainContent] Failed to initialize playlist ${playlistId}:`, error);
      setInitializationError(`Failed to initialize playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.debug(`[MainContent] Starting polling for playlist ${activePlaylist.id}`);
      try {
        await playlistStore.startPolling(
          activePlaylist.id,
          (added, removed, addedVersions, removedVersions, freshVersions) => {
            console.debug(`[MainContent] Polling detected changes: +${added}, -${removed}`);
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
      console.debug(`[MainContent] Stopping polling for playlist ${activePlaylist.id}`);
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
          { currentCount: currentVersionCount, newCount: newVersionCount }
        );
        setActivePlaylist(playlist);
      }
    }
  }, [playlist.versions, playlist.id, activePlaylist.id, activePlaylist.versions?.length, isInitializing]);

  const handleClearAdded = async () => {
    if (!activePlaylist.id) return;

    try {
      // Clear manually added versions from the database
      await playlistStore.clearAddedVersions(activePlaylist.id);

      // Keep only non-manually added versions in the UI
      const updatedVersions =
        activePlaylist.versions?.filter((v) => !v.manuallyAdded) || [];
      const updatedPlaylist = {
        ...activePlaylist,
        versions: updatedVersions,
        // Also clear the addedVersions array in the local state
        addedVersions: [],
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Update the local state as well to ensure immediate UI update
      setActivePlaylist(updatedPlaylist);

      // Clear any note drafts for the removed versions
      const removedVersionIds =
        activePlaylist.versions
          ?.filter((v) => v.manuallyAdded)
          .map((v) => v.id) || [];

      if (removedVersionIds.length > 0) {
        // The note management is now handled by the useNoteManagement hook
        // We need to clear the notes for each removed version
        for (const versionId of removedVersionIds) {
          await clearNoteDraft(versionId);
        }
      }
    } catch (error) {
      console.error("Failed to clear added versions:", error);
    }
  };

  const handleClearAll = () => {
    if (!activePlaylist.isQuickNotes) return;

    // Clear all versions from the playlist
    const updatedPlaylist = {
      ...activePlaylist,
      versions: [],
    };

    // Update the playlist in the store
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
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
    console.log('[MainContent] Computing sortedVersions:', {
      isInitializing,
      playlistId: activePlaylist.id,
      versionsCount: activePlaylist.versions?.length || 0,
      versions: activePlaylist.versions?.slice(0, 3).map(v => ({ id: v.id, name: v.name })) || []
    });

    if (isInitializing) {
      console.log('[MainContent] Still initializing, returning empty array');
      return [];
    }

    let filteredVersions = [...(activePlaylist.versions || [])];
    console.log('[MainContent] After copying versions:', filteredVersions.length);

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

    console.log('[MainContent] Final sorted versions:', sorted.length);
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

  // Show initialization error if it exists
  if (initializationError) {
    return (
      <Card className="h-full flex flex-col rounded-none">
        <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <CardTitle className="text-xl text-red-600">Error Loading Playlist</CardTitle>
              <p className="text-sm text-muted-foreground">{activePlaylist.name}</p>
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
            <CardTitle className="text-xl">
              {activePlaylist.name}
              {isInitializing && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Loading...)
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isInitializing ? (
                "Initializing playlist..."
              ) : (
                <>
                  {sortedVersions.length} Version
                  {sortedVersions.length !== 1 ? "s" : ""}
                  {(selectedStatuses.length > 0 || selectedLabels.length > 0) &&
                    ` (${activePlaylist.versions?.length || 0} total)`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!isInitializing && (modifications.added > 0 || modifications.removed > 0) ? (
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
        />
      )}
    </Card>
  );
};
