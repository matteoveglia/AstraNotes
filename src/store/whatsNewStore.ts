/**
 * @fileoverview whatsNewStore.ts
 * Manages the What's New modal state and tracking.
 * Shows release notes modal on first launch after an update.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GitHubRelease } from "../services/githubService";

export interface WhatsNewState {
  /** The version for which the What's New modal was last shown */
  lastShownVersion: string | null;
  /** Whether to show the What's New modal on next app start */
  shouldShowOnNextStart: boolean;
  /** Cached release data to avoid repeated API calls */
  cachedRelease: GitHubRelease | null;
  /** Last time the release data was fetched */
  lastFetchedAt: number | null;

  // Actions
  /** Mark the What's New modal as shown for a specific version */
  markAsShown: (version: string) => void;
  /** Set whether to show the modal on next app start */
  setShouldShowOnNextStart: (show: boolean) => void;
  /** Cache release data */
  setCachedRelease: (release: GitHubRelease | null) => void;
  /** Check if the modal should be shown for a given version */
  shouldShowForVersion: (currentVersion: string) => boolean;
  /** Reset the state (for debugging/testing) */
  reset: () => void;
}

export const useWhatsNewStore = create<WhatsNewState>()(
  persist(
    (set, get) => ({
      lastShownVersion: null,
      shouldShowOnNextStart: false,
      cachedRelease: null,
      lastFetchedAt: null,

      markAsShown: (version: string) =>
        set({
          lastShownVersion: version,
          shouldShowOnNextStart: false,
        }),

      setShouldShowOnNextStart: (show: boolean) =>
        set({
          shouldShowOnNextStart: show,
        }),

      setCachedRelease: (release: GitHubRelease | null) =>
        set({
          cachedRelease: release,
          lastFetchedAt: release ? Date.now() : null,
        }),

      shouldShowForVersion: (currentVersion: string) => {
        const { lastShownVersion, shouldShowOnNextStart } = get();

        // Always show if explicitly set to show on next start
        if (shouldShowOnNextStart) {
          return true;
        }

        // Show if we haven't shown for this version yet
        return lastShownVersion !== currentVersion;
      },

      reset: () =>
        set({
          lastShownVersion: null,
          shouldShowOnNextStart: false,
          cachedRelease: null,
          lastFetchedAt: null,
        }),
    }),
    {
      name: "astra-notes-whats-new-state",
    },
  ),
);
