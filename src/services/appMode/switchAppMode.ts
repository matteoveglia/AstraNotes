import { useAppModeStore, type AppMode } from "@/store/appModeStore";
import { playlistStore } from "@/store/playlist";
import { clearThumbnailCache } from "@/services/thumbnailService";
import { db } from "@/store/db";

interface SwitchOptions {
  /** Optional callback invoked before caches are cleared (e.g. close UI state). */
  onBeforeReset?: () => void;
}

export async function switchAppMode(mode: AppMode, options?: SwitchOptions): Promise<void> {
  const store = useAppModeStore.getState();
  const currentMode = store.appMode;

  if (currentMode === mode) {
    return;
  }

  store.setMode(mode);

  options?.onBeforeReset?.();

  try {
    playlistStore.stopAutoRefresh?.();
  } catch (error) {
    console.warn("[switchAppMode] Failed to stop playlist auto-refresh", error);
  }

  try {
    clearThumbnailCache();
  } catch (error) {
    console.warn("[switchAppMode] Failed to clear thumbnail cache", error);
  }

  try {
    await db.clearCache();
  } catch (error) {
    console.error("[switchAppMode] Failed to clear application cache", error);
    throw error;
  }
}
