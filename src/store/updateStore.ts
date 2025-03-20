/**
 * @fileoverview updateStore.ts
 * Manages the update notification state for the application.
 * Tracks update availability, notification times, and status.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { db } from "./db";

export interface UpdateState {
  updateAvailable: boolean;
  updateVersion: string;
  firstNotifiedAt: number | null; 
  lastCheckedAt: number | null;
  
  // Actions
  setUpdateAvailable: (available: boolean, version?: string) => void;
  setLastCheckedAt: (timestamp: number) => void;
  resetUpdateState: () => void;
  shouldShowNotification: () => boolean;
  shouldHighlightNotification: () => boolean;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      updateAvailable: false,
      updateVersion: "",
      firstNotifiedAt: null,
      lastCheckedAt: null,
      
      setUpdateAvailable: (available, version = "") => set((state) => {
        // Only set firstNotifiedAt when transitioning from no update to update available
        const firstNotifiedAt = (!state.updateAvailable && available) 
          ? Date.now() 
          : state.firstNotifiedAt;
        
        return {
          updateAvailable: available,
          updateVersion: available ? version : "",
          firstNotifiedAt,
        };
      }),
      
      setLastCheckedAt: (timestamp) => set({
        lastCheckedAt: timestamp,
      }),
      
      resetUpdateState: () => set({
        updateAvailable: false,
        updateVersion: "",
        firstNotifiedAt: null,
        lastCheckedAt: null,
      }),
      
      shouldShowNotification: () => {
        const { updateAvailable } = get();
        return updateAvailable;
      },
      
      shouldHighlightNotification: () => {
        const { updateAvailable, firstNotifiedAt } = get();
        if (!updateAvailable || !firstNotifiedAt) return false;
        
        // Check if 5 days (432000000 ms) have passed since first notification
        const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
        return Date.now() - firstNotifiedAt > fiveDaysInMs;
      },
    }),
    {
      name: "astra-notes-update-state",
    }
  )
);
