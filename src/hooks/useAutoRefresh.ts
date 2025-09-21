/**
 * @fileoverview useAutoRefresh.ts (Deprecated Shim)
 * Auto-refresh has been removed in Phase 4.7. This hook remains as a
 * backward-compatibility shim using optional chaining and returns
 * inert controls. Safe to remove once all call sites are gone.
 */

import { useEffect, useCallback, useMemo } from "react";
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
