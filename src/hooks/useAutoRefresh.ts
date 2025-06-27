/**
 * @fileoverview useAutoRefresh.ts
 * Custom hook for managing auto-refresh functionality.
 * Integrates with settings store and playlist store to provide
 * a clean interface for starting/stopping auto-refresh.
 */

import { useEffect, useCallback } from "react";
import { useSettings } from "@/store/settingsStore";
import { playlistStore } from "@/store/playlist";
import type { AssetVersion } from "@/types";

interface UseAutoRefreshOptions {
  playlistId: string;
  isEnabled?: boolean;
  onRefreshCompleted?: (result: {
    success: boolean;
    addedCount?: number;
    removedCount?: number;
    addedVersions?: AssetVersion[];
    removedVersions?: AssetVersion[];
    error?: string;
  }) => void;
}

export function useAutoRefresh({
  playlistId,
  isEnabled = true,
  onRefreshCompleted,
}: UseAutoRefreshOptions) {
  const { settings } = useSettings();

  // Start auto-refresh when conditions are met
  const startAutoRefresh = useCallback(async () => {
    if (
      !settings.autoRefreshEnabled ||
      !isEnabled ||
      playlistId === "quick-notes"
    ) {
      return;
    }

    try {
      await playlistStore.startAutoRefresh(playlistId, onRefreshCompleted);
      console.debug(
        `[useAutoRefresh] Started auto-refresh for playlist: ${playlistId}`,
      );
    } catch (error) {
      console.error(`[useAutoRefresh] Failed to start auto-refresh:`, error);
    }
  }, [playlistId, settings.autoRefreshEnabled, isEnabled, onRefreshCompleted]);

  // Stop auto-refresh
  const stopAutoRefresh = useCallback(() => {
    playlistStore.stopAutoRefresh();
    console.debug(`[useAutoRefresh] Stopped auto-refresh`);
  }, []);

  // Effect to start/stop auto-refresh based on settings and conditions
  useEffect(() => {
    if (
      settings.autoRefreshEnabled &&
      isEnabled &&
      playlistId !== "quick-notes"
    ) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }

    // Cleanup on unmount or dependency change
    return () => {
      stopAutoRefresh();
    };
  }, [
    settings.autoRefreshEnabled,
    isEnabled,
    playlistId,
    startAutoRefresh,
    stopAutoRefresh,
  ]);

  return {
    isAutoRefreshActive: playlistStore.isAutoRefreshActive(),
    currentAutoRefreshPlaylistId:
      playlistStore.getCurrentAutoRefreshPlaylistId(),
    startAutoRefresh,
    stopAutoRefresh,
  };
}
