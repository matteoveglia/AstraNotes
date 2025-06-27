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
  addedVersions?: AssetVersion[];
  removedVersions?: AssetVersion[];
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

    // Listen for auto-refresh events instead of manually starting polling
    const handleAutoRefreshCompleted = (data: any) => {
      if (data.playlistId === playlist.id && data.result.success) {
        const { addedCount, removedCount, addedVersions, removedVersions } =
          data.result;
        if (addedCount > 0 || removedCount > 0) {
          setModifications({
            added: addedCount,
            removed: removedCount,
            addedVersions: addedVersions || [],
            removedVersions: removedVersions || [],
          });

          // Reconstruct pending versions for the Update Playlist button
          // This includes current playlist versions minus removed ones plus added ones
          const currentVersions = playlist.versions || [];
          const removedVersionIds = new Set(
            (removedVersions || []).map((v: AssetVersion) => v.id),
          );
          const addedVersionIds = new Set(
            (addedVersions || []).map((v: AssetVersion) => v.id),
          );

          // Start with current versions, remove the ones that were removed
          const survivingVersions = currentVersions.filter(
            (v) => !removedVersionIds.has(v.id),
          );

          // Add the new versions
          const allVersions = [...survivingVersions, ...(addedVersions || [])];

          setPendingVersions(allVersions);

          console.debug(
            `[usePlaylistModifications] Auto-refresh completed with changes: +${addedCount} -${removedCount}`,
            { pendingVersionsCount: allVersions.length },
          );
        }
      }
    };

    const handleAutoRefreshFailed = (data: any) => {
      if (data.playlistId === playlist.id) {
        console.error(
          `[usePlaylistModifications] Auto-refresh failed for ${playlist.id}:`,
          data.error,
        );
      }
    };

    // Listen for playlist refresh events (from manual or auto refresh)
    const handlePlaylistRefreshed = (data: any) => {
      if (data.playlistId === playlist.id) {
        const { addedCount, removedCount, addedVersions, removedVersions } =
          data;
        if (addedCount > 0 || removedCount > 0) {
          setModifications({
            added: addedCount,
            removed: removedCount,
            addedVersions: addedVersions || [],
            removedVersions: removedVersions || [],
          });

          // Reconstruct pending versions for the Update Playlist button
          const currentVersions = playlist.versions || [];
          const removedVersionIds = new Set(
            (removedVersions || []).map((v: AssetVersion) => v.id),
          );

          // Start with current versions, remove the ones that were removed
          const survivingVersions = currentVersions.filter(
            (v) => !removedVersionIds.has(v.id),
          );

          // Add the new versions
          const allVersions = [...survivingVersions, ...(addedVersions || [])];

          setPendingVersions(allVersions);

          console.debug(
            `[usePlaylistModifications] Playlist refreshed with changes: +${addedCount} -${removedCount}`,
            { pendingVersionsCount: allVersions.length },
          );
        }
      }
    };

    console.debug(
      `[usePlaylistModifications] Setting up event listeners for playlist ${playlist.id}`,
    );

    // Set up event listeners
    playlistStore.on("auto-refresh-completed", handleAutoRefreshCompleted);
    playlistStore.on("auto-refresh-failed", handleAutoRefreshFailed);
    playlistStore.on("playlist-refreshed", handlePlaylistRefreshed);

    // Cleanup event listeners
    return () => {
      console.debug(
        `[usePlaylistModifications] Cleaning up event listeners for playlist ${playlist.id}`,
      );
      playlistStore.off("auto-refresh-completed", handleAutoRefreshCompleted);
      playlistStore.off("auto-refresh-failed", handleAutoRefreshFailed);
      playlistStore.off("playlist-refreshed", handlePlaylistRefreshed);
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
      if (
        modifications.removedVersions &&
        modifications.removedVersions.length > 0
      ) {
        console.debug(
          `[usePlaylistModifications] Marking ${modifications.removedVersions.length} versions as removed in database`,
        );
        for (const removedVersion of modifications.removedVersions) {
          try {
            await playlistStore.removeVersionFromPlaylist(
              playlist.id,
              removedVersion.id,
            );
            console.debug(
              `[usePlaylistModifications] Marked version ${removedVersion.id} as removed`,
            );
          } catch (error) {
            console.error(
              `[usePlaylistModifications] Failed to mark version ${removedVersion.id} as removed:`,
              error,
            );
          }
        }
      }

      // Get manually added versions from current playlist
      const manualVersions =
        playlist.versions?.filter((v) => v.manuallyAdded) || [];

      // Find newly added versions that need to be persisted to database
      const currentVersionIds = new Set(
        playlist.versions?.map((v) => v.id) || [],
      );
      const newVersionsToAdd = pendingVersions.filter(
        (v) => !currentVersionIds.has(v.id),
      );

      console.debug(
        `[usePlaylistModifications] Found ${newVersionsToAdd.length} new versions to persist to database`,
      );

      // CRITICAL FIX: Persist newly added versions to database first
      if (newVersionsToAdd.length > 0) {
        console.debug(
          `[usePlaylistModifications] Adding ${newVersionsToAdd.length} versions to database for playlist ${playlist.id}`,
        );
        await playlistStore.addVersionsToPlaylist(
          playlist.id,
          newVersionsToAdd,
        );
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
      const addedVersions = freshVersions.filter(
        (v) => !currentVersionIds.has(v.id) && !manualVersionIds.has(v.id),
      );

      // Only count versions as removed if they're not manually added
      const removedVersions = currentVersions.filter(
        (v) => !v.manuallyAdded && !freshVersionsMap.has(v.id),
      );

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
