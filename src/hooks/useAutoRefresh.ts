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
  // PHASE 4.6.2 FIX: Auto-refresh functionality completely removed
  console.debug(
    `[useAutoRefresh] Auto-refresh has been disabled - hook is now a no-op for playlist: ${playlistId}`,
  );

  // No-op functions to maintain API compatibility
  const startAutoRefresh = useCallback(async () => {
    console.debug(`[useAutoRefresh] Auto-refresh disabled - startAutoRefresh is a no-op`);
  }, []);

  const stopAutoRefresh = useCallback(() => {
    console.debug(`[useAutoRefresh] Auto-refresh disabled - stopAutoRefresh is a no-op`);
  }, []);

  return {
    isAutoRefreshActive: false, // Always false since auto-refresh is disabled
    currentAutoRefreshPlaylistId: null, // Always null since auto-refresh is disabled
    startAutoRefresh,
    stopAutoRefresh,
  };
}
