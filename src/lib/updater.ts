import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForUpdates() {
  try {
    const update = await check();

    if (update) {
      // Display update dialog to user
      if (
        confirm(
          `Version ${update.version} is available. Would you like to install it now?`,
        )
      ) {
        // Download and install the update
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              console.log(
                `Started downloading update: ${event.data.contentLength} bytes`,
              );
              break;
            case "Progress":
              console.log(`Downloaded ${event.data.chunkLength} bytes`);
              break;
            case "Finished":
              console.log("Download finished");
              break;
          }
        });

        // Relaunch the app
        await relaunch();
      }
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
  }
}
