/**
 * @fileoverview usePlaylistModifications.ts
 * Custom hook for managing playlist modifications and updates.
 * Handles detecting changes, applying updates, and refreshing playlists.
 */

import { useState, useEffect, useCallback } from "react";
import { Playlist, AssetVersion } from "@/types";
import { playlistStore } from "@/store/playlistStore";
import { ftrackService } from "@/services/ftrack";

interface Modifications {
  added: number;
  removed: number;
  addedVersions?: string[];
  removedVersions?: string[];
}

export function usePlaylistModifications(
  playlist: Playlist,
  onPlaylistUpdate?: (playlist: Playlist) => void,
) {
  const [modifications, setModifications] = useState<Modifications>({
    added: 0,
    removed: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingVersions, setPendingVersions] = useState<AssetVersion[] | null>(
    null,
  );

  // Start polling for changes when component mounts
  useEffect(() => {
    // Don't poll for Quick Notes playlist
    if (playlist.isQuickNotes) return;

    console.debug(
      `[usePlaylistModifications] Starting polling for playlist ${playlist.id}`,
    );
    playlistStore.startPolling(
      playlist.id,
      (added, removed, addedVersions, removedVersions, freshVersions) => {
        if (added > 0 || removed > 0) {
          setModifications({
            added,
            removed,
            addedVersions,
            removedVersions,
          });
          // Store the fresh versions but don't apply them yet
          setPendingVersions(freshVersions || null);
        }
      },
    );

    // Stop polling when component unmounts or playlist changes
    return () => {
      console.debug(
        `[usePlaylistModifications] Stopping polling for playlist ${playlist.id}`,
      );
      playlistStore.stopPolling();
    };
  }, [playlist.id, playlist.isQuickNotes]);

  // Apply pending changes to the playlist
  const applyPendingChanges = useCallback(async () => {
    if (!pendingVersions) return;

    try {
      // Get manually added versions from current playlist
      const manualVersions =
        playlist.versions?.filter((v) => v.manuallyAdded) || [];

      // Create a map of pending versions for quick lookup
      const pendingVersionsMap = new Map(pendingVersions.map((v) => [v.id, v]));

      // Merge pending versions with manual versions
      const mergedVersions = [
        ...pendingVersions,
        ...manualVersions.filter((v) => !pendingVersionsMap.has(v.id)),
      ];

      // Create a new playlist object with the merged versions
      const updatedPlaylist = {
        ...playlist,
        versions: mergedVersions,
      };

      // Update the cache first
      await playlistStore.cachePlaylist(
        playlistStore.cleanPlaylistForStorage(updatedPlaylist),
      );

      // Then notify parent components of the update
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Clear pending versions and modifications
      setPendingVersions(null);
      setModifications({ added: 0, removed: 0 });

      // Update playlist and restart polling
      await playlistStore.updatePlaylistAndRestartPolling(
        playlist.id,
        (added, removed, addedVersions, removedVersions, freshVersions) => {
          if (added > 0 || removed > 0) {
            setModifications({
              added,
              removed,
              addedVersions,
              removedVersions,
            });
            setPendingVersions(freshVersions || null);
          }
        },
      );

      return true;
    } catch (error) {
      console.error("Failed to apply changes:", error);
      return false;
    }
  }, [pendingVersions, playlist, onPlaylistUpdate]);

  // Manually refresh the playlist
  const refreshPlaylist = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // If we have pending versions, use those, otherwise fetch fresh ones
      const freshVersions =
        pendingVersions ||
        (await ftrackService.getPlaylistVersions(playlist.id));

      // Create maps for quick lookup
      const freshVersionsMap = new Map(freshVersions.map((v) => [v.id, v]));
      const currentVersions = playlist.versions || [];
      const manualVersions = currentVersions.filter((v) => v.manuallyAdded);
      const manualVersionIds = new Set(manualVersions.map((v) => v.id));

      // Compare with current versions to find modifications
      // Exclude manually added versions from this check
      const currentVersionIds = new Set(
        currentVersions.filter((v) => !v.manuallyAdded).map((v) => v.id),
      );

      // Only count versions as added if they're not manually added
      const addedVersions = freshVersions
        .filter(
          (v) => !currentVersionIds.has(v.id) && !manualVersionIds.has(v.id),
        )
        .map((v) => v.id);

      // Only count versions as removed if they're not manually added
      const removedVersions = currentVersions
        .filter((v) => !v.manuallyAdded && !freshVersionsMap.has(v.id))
        .map((v) => v.id);

      if (addedVersions.length > 0 || removedVersions.length > 0) {
        setModifications({
          added: addedVersions.length,
          removed: removedVersions.length,
          addedVersions,
          removedVersions,
        });
        // Store the fresh versions but don't apply them yet
        setPendingVersions(freshVersions);
        return true;
      } else {
        // No changes found, clear any pending versions
        setPendingVersions(null);
        setModifications({ added: 0, removed: 0 });
        return false;
      }
    } catch (error) {
      console.error("Failed to refresh playlist:", error);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [playlist.id, playlist.versions, pendingVersions]);

  return {
    modifications,
    isRefreshing,
    pendingVersions,
    applyPendingChanges,
    refreshPlaylist,
  };
}
