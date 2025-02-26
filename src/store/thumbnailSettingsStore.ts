import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThumbnailSettingsStore {
  size: number;
  setSize: (size: number) => void;
}

export const useThumbnailSettingsStore = create<ThumbnailSettingsStore>()(
  persist(
    (set) => ({
      size: 128, // Default size
      setSize: (size) => set({ size }),
    }),
    {
      name: 'thumbnail-settings-storage',
    },
  ),
);
