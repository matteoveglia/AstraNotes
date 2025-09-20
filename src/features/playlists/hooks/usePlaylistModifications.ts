/**
 * @fileoverview usePlaylistModifications.ts
 * Custom hook for managing playlist modifications and updates.
 * Handles detecting changes, applying updates, and refreshing playlists.
 */

import { useState, useEffect, useCallback } from "react";
import { Playlist, AssetVersion } from "@/types";
import { playlistStore } from "@/store/playlist";
import { ftrackPlaylistService } from "@/services/ftrack/FtrackPlaylistService";

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

    // PHASE 4.6.2 FIX: Listen for playlist changes detected (not auto-applied)
    const handlePlaylistChangesDetected = (data: any) => {
      if (data.playlistId === playlist.id) {
        const { addedCount, removedCount, addedVersions, removedVersions, freshVersions } = data;
        if (addedCount > 0 || removedCount > 0) {
          setModifications({
            added: addedCount,
            removed: removedCount,
            addedVersions: addedVersions || [],
            removedVersions: removedVersions || [],
          });

          // Store the fresh versions from ftrack for the refresh action
          // These represent the complete desired state, not just changes
          setPendingVersions(freshVersions || []);

          console.debug(
            `[usePlaylistModifications] Playlist changes detected: +${addedCount} -${removedCount} (not auto-applied)`,
            { freshVersionsCount: freshVersions?.length || 0 },
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

          // Store fresh versions for the Refresh button
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
    playlistStore.on("playlist-changes-detected", handlePlaylistChangesDetected);
    playlistStore.on("auto-refresh-failed", handleAutoRefreshFailed);
    playlistStore.on("playlist-refreshed", handlePlaylistRefreshed);

    // Cleanup event listeners
    return () => {
      console.debug(
        `[usePlaylistModifications] Cleaning up event listeners for playlist ${playlist.id}`,
      );
      playlistStore.off("playlist-changes-detected", handlePlaylistChangesDetected);
      playlistStore.off("auto-refresh-failed", handleAutoRefreshFailed);
      playlistStore.off("playlist-refreshed", handlePlaylistRefreshed);
    };
  }, [playlist.id, playlist.isQuickNotes]);

  // PHASE 4.6.2 FIX: Simplified refresh that applies detected changes
  const applyPendingChanges = useCallback(async () => {
    if (!pendingVersions || !modifications.addedVersions || !modifications.removedVersions) return;

    setIsRefreshing(true);
    console.debug(
      `[usePlaylistModifications] Applying playlist refresh for ${playlist.id}`,
      {
        freshVersionsCount: pendingVersions.length,
        addedCount: modifications.added,
        removedCount: modifications.removed,
      },
    );

    try {
      // Use the new applyPlaylistRefresh method to apply changes
      const result = await playlistStore.applyPlaylistRefresh(
        playlist.id,
        pendingVersions,
        modifications.addedVersions,
        modifications.removedVersions
      );

      if (!result.success) {
        console.error(`[usePlaylistModifications] Failed to apply refresh:`, result.error);
        return false;
      }

      // Clear pending state
      setPendingVersions(null);
      setModifications({ added: 0, removed: 0 });

      // Get the updated playlist from cache
      const updatedPlaylist = await playlistStore.getPlaylist(playlist.id);
      if (updatedPlaylist && onPlaylistUpdate) {
        // Convert to UI format and notify parent
        const uiPlaylist = {
          ...playlist,
          versions: updatedPlaylist.versions || [],
        };
        onPlaylistUpdate(uiPlaylist);
      }

      console.debug(`[usePlaylistModifications] Successfully applied playlist refresh`);
      return true;
    } catch (error) {
      console.error("Failed to apply playlist refresh:", error);
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
        (await ftrackPlaylistService.getPlaylistVersions(playlist.ftrackId));

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

  // PHASE 4.6.3: Direct refresh without modifications banner
  const directRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.debug(
        `[usePlaylistModifications] Direct refresh for playlist ${playlist.id}`,
      );

      const result = await playlistStore.directPlaylistRefresh(playlist.id);
      
      if (result.success) {
        // Clear any pending modifications since we just refreshed
        setPendingVersions(null);
        setModifications({ added: 0, removed: 0 });
        
        // Notify parent to update UI with fresh data
        if (onPlaylistUpdate) {
          const updatedPlaylist = await playlistStore.getPlaylist(playlist.id);
          if (updatedPlaylist) {
            const uiPlaylist = {
              ...playlist,
              versions: updatedPlaylist.versions || [],
            };
            onPlaylistUpdate(uiPlaylist);
          }
        }
        
        console.debug(
          `[usePlaylistModifications] Direct refresh completed: +${result.addedCount || 0} -${result.removedCount || 0}`,
        );
        return true;
      } else {
        console.error(`[usePlaylistModifications] Direct refresh failed:`, result.error);
        return false;
      }
    } catch (error) {
      console.error("Direct refresh failed:", error);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [playlist.id, playlist, onPlaylistUpdate]);

  return {
    modifications,
    setModifications,
    isRefreshing,
    pendingVersions,
    applyPendingChanges,
    refreshPlaylist, // Keep old method for compatibility
    directRefresh, // New direct refresh method
  };
}
