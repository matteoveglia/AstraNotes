/**
 * @fileoverview useAutoRefresh.ts
 * Custom hook for managing auto-refresh functionality.
 * Integrates with settings store and playlist store to provide
 * a clean interface for starting/stopping auto-refresh.
 */

import { useEffect, useCallback, useMemo } from "react";
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
  const isQuickNotes = useMemo(
    () => playlistId.startsWith("quick-notes-"),
    [playlistId],
  );

  // Start/stop auto-refresh based on flags. Skip Quick Notes.
  useEffect(() => {
    if (isEnabled && !isQuickNotes) {
      (playlistStore as any).startAutoRefresh?.(playlistId, onRefreshCompleted);
      return () => {
        (playlistStore as any).stopAutoRefresh?.();
      };
    }
    return;
  }, [playlistId, isEnabled, isQuickNotes, onRefreshCompleted]);

  const startAutoRefresh = useCallback(
    (cb?: (result: any) => void) => {
      (playlistStore as any).startAutoRefresh?.(playlistId, cb ?? onRefreshCompleted);
    },
    [playlistId, onRefreshCompleted],
  );

  const stopAutoRefresh = useCallback(() => {
    (playlistStore as any).stopAutoRefresh?.();
  }, []);

  const isAutoRefreshActive = (playlistStore as any).isAutoRefreshActive?.() ?? false;
  const currentAutoRefreshPlaylistId =
    (playlistStore as any).getCurrentAutoRefreshPlaylistId?.() ?? null;

  return {
    isAutoRefreshActive,
    currentAutoRefreshPlaylistId,
    startAutoRefresh,
    stopAutoRefresh,
  };
}
