import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
  autoRefreshEnabled: boolean;
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
        autoRefreshEnabled: true,
        defaultLabelId: undefined,
      },
      setSettings: (newSettings) => set({ settings: newSettings }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
