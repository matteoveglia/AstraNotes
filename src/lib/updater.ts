/**
 * @fileoverview updater.ts
 * Application update management system.
 * Handles version checking, download progress tracking,
 * and application relaunch after updates.
 */

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { confirm, message } from '@tauri-apps/plugin-dialog';

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
          title: 'Update Available',
          kind: 'info'
        }
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
        await relaunch();
      } else {
        console.log("User declined update");
      }
    } else {
      console.log("No update available");
      const noUpdateMessage = await message(
        'No update available',
        { 
          title: 'AstraNotes',
          kind: 'info'
        }
      );
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
    if (error instanceof Error) {
      console.error({
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  }
}