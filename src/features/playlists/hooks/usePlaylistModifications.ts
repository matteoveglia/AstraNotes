/**
 * @fileoverview usePlaylistModifications.ts
 * Custom hook for managing playlist modifications and updates.
 * Handles detecting changes, applying updates, and refreshing playlists.
 */

import { useState, useEffect, useCallback } from "react";
import { Playlist, AssetVersion } from "@/types";
import { playlistStore } from "@/store/playlist";
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

    setIsRefreshing(true);
    console.debug(
      `[usePlaylistModifications] Applying pending changes for playlist ${playlist.id}`,
      {
        pendingVersionsCount: pendingVersions.length,
        currentModifications: modifications,
      },
    );

    try {
      // CRITICAL FIX: Mark removed versions in database before updating UI
      if (modifications.removedVersions && modifications.removedVersions.length > 0) {
        console.debug(`[usePlaylistModifications] Marking ${modifications.removedVersions.length} versions as removed in database`);
        for (const removedVersionId of modifications.removedVersions) {
          try {
            await playlistStore.removeVersionFromPlaylist(playlist.id, removedVersionId);
            console.debug(`[usePlaylistModifications] Marked version ${removedVersionId} as removed`);
          } catch (error) {
            console.error(`[usePlaylistModifications] Failed to mark version ${removedVersionId} as removed:`, error);
          }
        }
      }

      // Get manually added versions from current playlist
      const manualVersions =
        playlist.versions?.filter((v) => v.manuallyAdded) || [];

      // Find newly added versions that need to be persisted to database
      const currentVersionIds = new Set(playlist.versions?.map(v => v.id) || []);
      const newVersionsToAdd = pendingVersions.filter(v => !currentVersionIds.has(v.id));
      
      console.debug(`[usePlaylistModifications] Found ${newVersionsToAdd.length} new versions to persist to database`);
      
      // CRITICAL FIX: Persist newly added versions to database first
      if (newVersionsToAdd.length > 0) {
        console.debug(`[usePlaylistModifications] Adding ${newVersionsToAdd.length} versions to database for playlist ${playlist.id}`);
        await playlistStore.addVersionsToPlaylist(playlist.id, newVersionsToAdd);
      }

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

      console.debug(`[usePlaylistModifications] Merged playlist created`, {
        originalVersionsCount: playlist.versions?.length || 0,
        mergedVersionsCount: mergedVersions.length,
        manualVersionsCount: manualVersions.length,
        pendingVersionsCount: pendingVersions.length,
        newVersionsAdded: newVersionsToAdd.length,
      });

      // Clear pending versions and modifications FIRST to prevent UI flickering
      setPendingVersions(null);
      setModifications({ added: 0, removed: 0 });
      console.debug(`[usePlaylistModifications] Cleared pending state`);

      // Update the cache (versions are already in database from above)
      await playlistStore.cachePlaylist(
        playlistStore.cleanPlaylistForStorage(updatedPlaylist),
      );

      // Notify parent components of the update
      if (onPlaylistUpdate) {
        console.debug(`[usePlaylistModifications] Notifying parent of update`);
        onPlaylistUpdate(updatedPlaylist);
      }

      // Give UI time to update before restarting polling
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Update playlist and restart polling
      console.debug(`[usePlaylistModifications] Restarting polling`);
      await playlistStore.updatePlaylistAndRestartPolling(
        playlist.id,
        (added, removed, addedVersions, removedVersions, freshVersions) => {
          if (added > 0 || removed > 0) {
            console.debug(
              `[usePlaylistModifications] New modifications detected after restart`,
              {
                added,
                removed,
                addedVersions,
                removedVersions,
              },
            );
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

      console.debug(
        `[usePlaylistModifications] Successfully applied pending changes`,
      );
      return true;
    } catch (error) {
      console.error("Failed to apply changes:", error);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [pendingVersions, playlist, onPlaylistUpdate, modifications]);

  // Manually refresh the playlist
  const refreshPlaylist = useCallback(async () => {
    setIsRefreshing(true);
    try {

      
      // For synced playlists, use ftrackId; for local playlists, skip refresh
      if (!playlist.ftrackId) {
        console.debug(`Cannot refresh local-only playlist: ${playlist.name}`);
        return false;
      }

      // If we have pending versions, use those, otherwise fetch fresh ones
      const freshVersions =
        pendingVersions ||
        (await ftrackService.getPlaylistVersions(playlist.ftrackId));

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
