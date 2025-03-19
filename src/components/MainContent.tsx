/**
 * @fileoverview MainContent.tsx
 * Primary component managing playlist version display and interaction.
 * Handles version selection, note drafts, publishing, and playlist synchronization.
 * Features include note management, batch publishing, real-time updates,
 * version sorting/filtering, and FTrack service integration.
 * @component
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Playlist, AssetVersion } from "../types";
import { ftrackService } from "../services/ftrack";
import { playlistStore } from "../store/playlistStore";
import { RefreshCw } from "lucide-react";
import { useSettings } from "../store/settingsStore";
import { useToast } from "./ui/toast";

// Import custom hooks
import { usePlaylistModifications } from "@/features/playlists/hooks/usePlaylistModifications";
import { useNoteManagement } from "@/features/notes/hooks/useNoteManagement";
import { useThumbnailLoading } from "@/features/versions/hooks/useThumbnailLoading";

// Import components
import { ModificationsBanner } from "@/features/versions/components/ModificationsBanner";
import { PublishingControls } from "@/features/notes/components/PublishingControls";
import { VersionGrid } from "@/features/versions/components/VersionGrid";
import { SearchPanel } from "@/features/versions/components/SearchPanel";

interface MainContentProps {
  playlist: Playlist;
  onPlaylistUpdate?: (playlist: Playlist) => void;
}

export const MainContent: React.FC<MainContentProps> = ({
  playlist,
  onPlaylistUpdate,
}) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [mergedPlaylist, setMergedPlaylist] = useState<Playlist | null>(null);

  // Ref for tracking if component is mounted
  const isMountedRef = useRef(true);

  const activePlaylist = mergedPlaylist || playlist;

  // Initialize playlist in store
  useEffect(() => {
    const initializePlaylist = async () => {
      setIsInitializing(true);
      console.debug(`[MainContent] Initializing playlist ${playlist.id}`);

      try {
        // Stop any existing polling before initializing a new playlist
        playlistStore.stopPolling();

        // Initialize in the store
        await playlistStore.initializePlaylist(playlist.id, playlist);

        // Then get the merged version with proper data from IndexedDB
        const cached = await playlistStore.getPlaylist(playlist.id);
        if (cached) {
          setMergedPlaylist({
            ...playlist,
            versions: cached.versions,
          });
        } else {
          setMergedPlaylist(playlist);
        }
      } catch (error) {
        console.error(`Failed to initialize playlist ${playlist.id}:`, error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializePlaylist();

    // Cleanup when unmounting
    return () => {
      console.debug(`[MainContent] Cleaning up for playlist ${playlist.id}`);
      playlistStore.stopPolling();
    };
  }, [playlist.id]);

  // Use custom hooks
  const { settings } = useSettings();
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
    isPublishing,
    saveNoteDraft,
    clearNoteDraft,
    toggleVersionSelection,
    publishSelectedNotes,
    publishAllNotes,
    clearAllNotes,
    setAllLabels,
    getDraftCount,
  } = useNoteManagement(activePlaylist);

  const { thumbnails } = useThumbnailLoading(activePlaylist.versions || []);

  // Auto-refresh polling based on settings
  useEffect(() => {
    // Don't poll for Quick Notes playlist
    if (activePlaylist.isQuickNotes) return;

    if (!settings.autoRefreshEnabled) {
      playlistStore.stopPolling();
      return;
    }

    // Start polling when component mounts
    console.debug(
      `[MainContent] Starting polling for playlist ${activePlaylist.id}`,
    );
    playlistStore.startPolling(
      activePlaylist.id,
      (added, removed, addedVersions, removedVersions, freshVersions) => {
        if (added > 0 || removed > 0) {
          // This is now handled by the usePlaylistModifications hook
        }
      },
    );

    // Stop polling when component unmounts or playlist changes
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
  ]);

  // Cleanup when component unmounts
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
    };
  }, []);

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
      setMergedPlaylist(updatedPlaylist);

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
      setMergedPlaylist(updatedPlaylist);
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
        setMergedPlaylist(updatedPlaylist);

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
    if (isInitializing) return [];
    return [...(activePlaylist.versions || [])].sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by version number
      return a.version - b.version;
    });
  }, [activePlaylist.versions, isInitializing]);

  return (
    <Card className="h-full flex flex-col rounded-none">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl">{activePlaylist.name}</CardTitle>
          {!activePlaylist.isQuickNotes && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={refreshPlaylist}
                disabled={isRefreshing}
                title="Refresh Playlist"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {modifications.added > 0 || modifications.removed > 0 ? (
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
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <VersionGrid
          versions={sortedVersions}
          thumbnails={thumbnails}
          noteStatuses={noteStatuses}
          selectedVersions={selectedVersions}
          noteDrafts={noteDrafts}
          noteLabelIds={noteLabelIds}
          onSaveNote={saveNoteDraft}
          onClearNote={clearNoteDraft}
          onToggleSelection={toggleVersionSelection}
        />
      </CardContent>

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
    </Card>
  );
};
