/**
 * @fileoverview updater.ts
 * Application update management system.
 * Handles version checking, download progress tracking,
 * and application relaunch after updates.
 * Supports both interactive and silent updates.
 */

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { useUpdateStore } from "../store/updateStore";
import { useWhatsNewStore } from "../store/whatsNewStore";

// Time constants
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Checks if an update is due based on the last check timestamp
 */
export function isUpdateCheckDue(): boolean {
  const { lastCheckedAt } = useUpdateStore.getState();

  // If never checked or checked more than 12 hours ago
  return !lastCheckedAt || Date.now() - lastCheckedAt > TWELVE_HOURS_MS;
}

/**
 * Silently checks for updates without showing user prompts
 * Updates the state if an update is available
 * @param showNoUpdateDialog If true, shows a dialog when no updates are available
 */
export async function silentCheckForUpdates(
  showNoUpdateDialog = false,
): Promise<boolean> {
  try {
    console.log("Running silent update check...");

    // Update the last checked timestamp regardless of result
    useUpdateStore.getState().setLastCheckedAt(Date.now());

    const update = await check();

    if (update) {
      console.log(`Update available: v${update.version}`);
      useUpdateStore.getState().setUpdateAvailable(true, update.version);
      return true;
    } else {
      console.log("No updates available");
      useUpdateStore.getState().setUpdateAvailable(false);

      // Show dialog if requested (when triggered from Settings)
      if (showNoUpdateDialog) {
        await message("No update available", {
          title: "AstraNotes",
          kind: "info",
        });
      }

      return false;
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
    return false;
  }
}

/**
 * Directly installs the available update without confirmation
 * This is meant to be triggered by the user through the Settings UI
 */
export async function installUpdate(): Promise<boolean> {
  try {
    const update = await check();

    if (!update) {
      console.log("No update available to install");
      useUpdateStore.getState().setUpdateAvailable(false);
      return false;
    }

    // Directly proceed with download and installation
    await update.downloadAndInstall((event) => {
      console.log("Download progress:", event);
    });

    // Reset update state before relaunch
    useUpdateStore.getState().resetUpdateState();

    // Set flag to show What's New modal on next start
    useWhatsNewStore.getState().setShouldShowOnNextStart(true);

    // Relaunch the application
    await relaunch();
    return true;
  } catch (error) {
    console.error("Error installing update:", error);
    return false;
  }
}

/**
 * Interactive check for updates that shows prompts to the user
 */
export async function checkForUpdates() {
  try {
    console.log("Starting update check...");

    const update = await check();

    console.log("Update check result:", update);

    if (update) {
      console.log("Update available, showing confirmation dialog");

      // Log before showing the dialog
      console.log("Showing confirmation dialog for version", update.version);

      const userConfirmed = await confirm(
        `Version ${update.version} is available. Would you like to install it now?`,
        {
          title: "Update Available",
          kind: "info",
        },
      );

      // Log after user response
      console.log("User confirmed update:", userConfirmed);

      if (userConfirmed) {
        console.log("Starting download process");

        // Download progress monitoring
        await update.downloadAndInstall((event) => {
          console.log("Download event:", event.event);
        });

        console.log("Download complete, preparing to relaunch");
        
        // Set flag to show What's New modal on next start
        useWhatsNewStore.getState().setShouldShowOnNextStart(true);
        
        await relaunch();
      } else {
        console.log("User declined update");
      }
    } else {
      console.log("No update available");
      const noUpdateMessage = await message("No update available", {
        title: "AstraNotes",
        kind: "info",
      });
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
    if (error instanceof Error) {
      console.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }
  }
}

/**
 * Initializes the update checker to run periodically
 */
export function initializeUpdateChecker() {
  // Run initial check on startup with a slight delay
  setTimeout(() => {
    silentCheckForUpdates(false); // Don't show dialog for automatic checks
  }, 10000); // 10 seconds delay on startup

  // Set up interval to check every 12 hours
  setInterval(
    () => {
      if (isUpdateCheckDue()) {
        silentCheckForUpdates(false); // Don't show dialog for automatic checks
      }
    },
    30 * 60 * 1000,
  ); // Check every 30 minutes if due (to catch when computer wakes from sleep)
}
