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
  defaultLabelId?: string;
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
        defaultLabelId: undefined,
      },
      setSettings: (newSettings) => set({ settings: newSettings }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
