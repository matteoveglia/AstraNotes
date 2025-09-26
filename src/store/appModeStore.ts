import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "real" | "demo";

export const APP_MODE_CHANGE_EVENT = "app-mode-changed" as const;

const emitModeChange = (mode: AppMode) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(APP_MODE_CHANGE_EVENT, {
      detail: { mode },
    }),
  );
};

interface AppModeState {
  /** Current application mode (real ftrack-backed vs demo mock data). */
  appMode: AppMode;
  /** Optional demo seed version identifier for tracking fixture revisions. */
  demoSeedVersion?: string;
  /** Explicitly set the application mode. */
  setMode: (mode: AppMode, options?: { silent?: boolean }) => void;
  /** Toggle between real and demo modes. */
  toggleMode: () => void;
  /** Update the demo seed version metadata. */
  setDemoSeedVersion: (seedVersion?: string) => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    (set, get) => ({
      appMode: "real",
      demoSeedVersion: undefined,
      setMode: (mode, options) => {
        const currentMode = get().appMode;

        if (currentMode === mode) {
          if (options?.silent !== true) {
            emitModeChange(mode);
          }
          return;
        }

        set({ appMode: mode, demoSeedVersion: undefined });

        if (options?.silent !== true) {
          emitModeChange(mode);
        }
      },
      toggleMode: () => {
        const nextMode: AppMode = get().appMode === "real" ? "demo" : "real";
        get().setMode(nextMode);
      },
      setDemoSeedVersion: (seedVersion) => set({ demoSeedVersion: seedVersion }),
    }),
    {
      name: "app-mode-storage",
      partialize: (state) => ({
        appMode: state.appMode,
        demoSeedVersion: state.demoSeedVersion,
      }),
    },
  ),
);
