/**
 * @fileoverview labelStore.ts
 * Zustand store for managing note labels.
 * Provides label fetching, caching, and state management.
 * Integrates with FTrack service for label synchronization.
 */

import { create } from "zustand";
import { ftrackNoteService } from "../services/ftrack/FtrackNoteService";

interface Label {
  id: string;
  name: string;
  color: string;
}

interface LabelStore {
  labels: Label[];
  isLoading: boolean;
  error: Error | null;
  fetchLabels: () => Promise<void>;
}

export const useLabelStore = create<LabelStore>((set) => ({
  labels: [],
  isLoading: false,
  error: null,
  fetchLabels: async () => {
    try {
      set({ isLoading: true, error: null });
      const labels = await ftrackNoteService.getNoteLabels();
      set({ labels, isLoading: false });
    } catch (error) {
      set({ error: error as Error, isLoading: false });
      console.error("Failed to fetch note labels:", error);
    }
  },
}));
