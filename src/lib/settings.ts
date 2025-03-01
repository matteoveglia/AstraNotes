/**
 * @fileoverview settings.ts
 * Application settings initialization and update checks.
 * Sets up event listeners for update checking button.
 * Integrates with Tauri updater system.
 */

import { checkForUpdates } from "./updater";

export function addUpdateCheck() {
  const checkUpdatesButton = document.getElementById("check-updates-button");
  if (checkUpdatesButton) {
    checkUpdatesButton.addEventListener("click", checkForUpdates);
  }
}
