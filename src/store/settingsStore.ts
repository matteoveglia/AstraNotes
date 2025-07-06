/**
 * @fileoverview settingsStore.ts
 * Application settings state management using Zustand.
 * Persists user preferences including:
 * - FTrack connection details
 * - Auto-refresh settings
 * - Default label preferences
 * Features local storage persistence.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
  autoRefreshEnabled: boolean;
  defaultLabelId?: string;
  /**
   * TEMPORARY: When true, wrapper services continue delegating to the legacy monolith.
   * Set to false once Phase 3.5 migration is complete.
   */
  useMonolithFallback: boolean;
}

interface SettingsState {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        serverUrl: "",
        apiKey: "",
        apiUser: "",
        autoRefreshEnabled: true,
        defaultLabelId: undefined,
        useMonolithFallback: true,
      },
      setSettings: (newSettings) => set({ settings: newSettings }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
