import { create } from "zustand";
import { ftrackService } from "../services/ftrack";

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
      const labels = await ftrackService.getNoteLabels();
      set({ labels, isLoading: false });
    } catch (error) {
      set({ error: error as Error, isLoading: false });
      console.error("Failed to fetch note labels:", error);
    }
  },
}));
