/**
 * @fileoverview PlaylistSync.ts
 * Handles synchronization between local playlists and ftrack using stable UUIDs.
 * NO ID CHANGES - playlists keep their stable UUIDs throughout sync.
 * This ensures no UI remounting or data loss.
 */

// Simple browser-compatible event emitter
class SimpleEventEmitter {
  private listeners: Record<string, Function[]> = {};

  on(event: string, listener: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
  }

  emit(event: string, data?: any): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error(`[EventEmitter] Error in listener for ${event}:`, error);
      }
    });
  }

  removeAllListeners(): void {
    this.listeners = {};
  }
}

import { PlaylistRepository } from "./PlaylistRepository";
import { PlaylistCache } from "./PlaylistCache";
import { ftrackPlaylistService } from "@/services/ftrack/FtrackPlaylistService";
import {
  PlaylistEntity,
  VersionEntity,
  SyncOperations,
  PlaylistEvent,
} from "./types";
import { Playlist, AssetVersion, CreatePlaylistRequest } from "@/types";
import { usePlaylistsStore } from "../playlistsStore";

export class PlaylistSync extends SimpleEventEmitter implements SyncOperations {
  private activeSyncs = new Set<string>();

  constructor(
    private repository: PlaylistRepository,
    private cache: PlaylistCache,
    private ftrackService: typeof ftrackPlaylistService,
  ) {
    super();
    console.log("[PlaylistSync] Initialized with stable UUID architecture");
  }

  // =================== SYNC OPERATIONS ===================

  /**
   * Syncs a playlist to ftrack WITHOUT changing its ID.
   * The playlist keeps its stable UUID, we just add ftrack metadata.
   * This prevents any UI disruption or data loss.
   */
  async syncPlaylist(playlistId: string): Promise<void> {
    console.log(`[PlaylistSync] Starting sync for playlist: ${playlistId}`);

    // Prevent duplicate syncs
    if (this.activeSyncs.has(playlistId)) {
      console.log(`[PlaylistSync] Sync already in progress for: ${playlistId}`);
      return;
    }

    this.activeSyncs.add(playlistId);

    try {
      // 1. Get the playlist entity
      const playlist = await this.repository.getPlaylist(playlistId);
      if (!playlist) {
        throw new Error(`Playlist ${playlistId} not found`);
      }

      // 2. Check if already synced
      if (playlist.ftrackSyncStatus === "synced" && playlist.ftrackId) {
        console.log(
          `[PlaylistSync] Playlist ${playlistId} already synced to ftrack: ${playlist.ftrackId}`,
        );
        this.activeSyncs.delete(playlistId);
        return;
      }

      // 3. Update status to syncing
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: "syncing",
      });

      this.emit("sync-started", {
        type: "sync-started",
        playlistId,
        data: { progress: { current: 1, total: 4, step: "Starting sync" } },
      } as PlaylistEvent);

      // 4. Pre-sync name validation (check ftrack directly)
      this.emit("sync-progress", {
        type: "sync-started",
        playlistId,
        data: {
          progress: {
            current: 1.5,
            total: 4,
            step: "Checking for name conflicts",
          },
        },
      } as PlaylistEvent);

      const nameConflictCheck = await this.checkForFtrackNameConflict(playlist);
      if (nameConflictCheck.hasConflict) {
        console.debug(
          `[PlaylistSync] Pre-sync check found name conflict for: ${playlist.name}`,
        );

        // Update sync status to indicate conflict
        await this.repository.updatePlaylist(playlistId, {
          ftrackSyncStatus: "failed",
        });

        // Emit conflict event with the conflict details
        const conflictEventData = {
          playlistId: playlist.id,
          playlistName: playlist.name,
          playlistType: playlist.type,
          projectId: playlist.projectId,
          errorMessage: `A playlist named "${playlist.name}" already exists in ftrack`,
        };
        console.debug(
          "[PlaylistSync] About to emit sync-name-conflict-detected event:",
          conflictEventData,
        );
        this.emit("sync-name-conflict-detected", conflictEventData);
        console.debug("[PlaylistSync] Event emitted successfully");

        // Throw a special error that UI can handle (but different from regular sync errors)
        const conflictError = new Error(
          `SYNC_CONFLICT: A playlist named "${playlist.name}" already exists in ftrack`,
        );
        (conflictError as any).isNameConflict = true;
        throw conflictError;
      }

      // 5. Create in ftrack (name is now validated)
      let ftrackResponse;
      try {
        ftrackResponse = await this.createInFtrack(playlist);
      } catch (error) {
        // Check if this is a name conflict
        const parseResult = this.parseFtrackDuplicateError(error as Error);
        if (parseResult.isDuplicate) {
          // Handle name conflict - emit event and mark as waiting for resolution
          console.debug(
            `[PlaylistSync] Name conflict detected - putting sync on hold for user resolution`,
          );

          // Update sync status to indicate waiting for user resolution
          await this.repository.updatePlaylist(playlistId, {
            ftrackSyncStatus: "failed", // Mark as failed so UI shows proper state
          });

          // Emit conflict event for UI to handle
          this.handleSyncConflict(playlist, error as Error);

          // Note: Keep playlist in activeSyncs - it will be removed when user resolves or cancels
          return; // Exit sync workflow, waiting for user decision
        } else {
          // Not a name conflict, re-throw to normal error handling
          throw error;
        }
      }

      this.emit("sync-progress", {
        type: "sync-started",
        playlistId,
        data: { progress: { current: 2, total: 5, step: "Created in ftrack" } },
      } as PlaylistEvent);

      // 6. Get versions to sync
      const versions = await this.repository.getPlaylistVersions(playlistId);

      // 7. Sync versions to ftrack if any exist
      if (versions.length > 0) {
        console.log(
          `[PlaylistSync] Syncing ${versions.length} versions to ftrack playlist: ${ftrackResponse.id}`,
        );

        const versionIds = versions.map((v) => v.id);
        const syncResponse = await this.ftrackService.addVersionsToPlaylist(
          ftrackResponse.id,
          versionIds,
          playlist.type,
        );

        if (!syncResponse.success) {
          throw new Error(
            syncResponse.error || "Failed to sync versions to ftrack",
          );
        }

        console.log(
          `[PlaylistSync] Successfully synced ${syncResponse.syncedVersionIds.length} versions`,
        );
      }

      this.emit("sync-progress", {
        type: "sync-started",
        playlistId,
        data: { progress: { current: 3, total: 5, step: "Synced versions" } },
      } as PlaylistEvent);

      // 8. Update playlist with success - SAME ID, just add ftrack metadata
      console.log(
        `[PlaylistSync] About to update playlist ${playlistId} with ftrackId: ${ftrackResponse.id}`,
      );
      console.log(`[PlaylistSync] Full ftrackResponse:`, ftrackResponse);

      await this.repository.updatePlaylist(playlistId, {
        ftrackId: ftrackResponse.id,
        localStatus: "synced",
        ftrackSyncStatus: "synced",
        syncedAt: new Date().toISOString(),
      });

      // CRITICAL FIX: Update all versions to mark them as no longer manually added
      // After sync, all versions are now part of the official ftrack playlist
      if (versions.length > 0) {
        console.log(
          `[PlaylistSync] Updating ${versions.length} versions to mark as no longer manually added`,
        );
        for (const version of versions) {
          await this.repository.updateVersion(playlistId, version.id, {
            manuallyAdded: false,
          });
        }
        console.log(
          `[PlaylistSync] Successfully updated version flags for ${versions.length} versions`,
        );
      }

      console.log(
        `[PlaylistSync] Database update completed for playlist ${playlistId}`,
      );

      // 9. Clear cache to force fresh load
      this.cache.invalidate(playlistId);

      // Emit playlist update event to notify UI of sync status change
      this.emit("playlist-updated", {
        playlistId,
        updates: {
          ftrackId: ftrackResponse.id,
          localStatus: "synced",
          ftrackSyncStatus: "synced",
          isLocalOnly: false,
        },
      });

      this.emit("sync-completed", {
        type: "sync-completed",
        playlistId,
        data: {
          ftrackId: ftrackResponse.id,
          versionsCount: versions.length,
          progress: { current: 5, total: 5, step: "Completed" },
        },
      } as PlaylistEvent);

      console.log(
        `[PlaylistSync] Successfully synced playlist ${playlistId} to ftrack ${ftrackResponse.id}`,
      );
    } catch (error) {
      console.error(
        `[PlaylistSync] Failed to sync playlist ${playlistId}:`,
        error,
      );

      // Update with error status - still same ID
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: "failed",
      });

      this.emit("sync-failed", {
        type: "sync-failed",
        playlistId,
        error: error instanceof Error ? error.message : "Unknown sync error",
      } as PlaylistEvent);

      throw error;
    } finally {
      this.activeSyncs.delete(playlistId);
    }
  }

  /**
   * Checks the sync status of a playlist
   */
  async checkSyncStatus(
    playlistId: string,
  ): Promise<"not_synced" | "syncing" | "synced" | "failed"> {
    const playlist = await this.repository.getPlaylist(playlistId);
    return playlist?.ftrackSyncStatus || "not_synced";
  }

  /**
   * Gets all playlists that are currently syncing
   */
  getActiveSyncs(): string[] {
    return Array.from(this.activeSyncs);
  }

  /**
   * Cancels a sync operation (if possible)
   */
  async cancelSync(playlistId: string): Promise<void> {
    if (this.activeSyncs.has(playlistId)) {
      this.activeSyncs.delete(playlistId);

      // Reset sync status
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: "not_synced",
      });

      console.log(`[PlaylistSync] Cancelled sync for playlist: ${playlistId}`);
    }
  }

  // =================== CONFLICT HANDLING ===================

  /**
   * Checks ftrack directly for playlist name conflicts before attempting sync
   */
  private async checkForFtrackNameConflict(
    playlist: PlaylistEntity,
  ): Promise<{ hasConflict: boolean; conflictingId?: string }> {
    try {
      console.debug(
        `[PlaylistSync] Checking ftrack for existing playlist named: "${playlist.name}"`,
      );

      // Query ftrack directly for playlists with the same name and project
      const existingPlaylists =
        playlist.type === "reviewsession"
          ? await this.ftrackService.getPlaylists(playlist.projectId)
          : await this.ftrackService.getLists(playlist.projectId);

      // Check if any existing playlist has the same name (with proper typing)
      const conflictingPlaylist = existingPlaylists.find(
        (p: { name: string; id: string }) => p.name === playlist.name,
      );

      if (conflictingPlaylist) {
        console.debug(
          `[PlaylistSync] Found conflicting playlist in ftrack: ${conflictingPlaylist.id} - "${conflictingPlaylist.name}"`,
        );
        return { hasConflict: true, conflictingId: conflictingPlaylist.id };
      }

      console.debug(
        `[PlaylistSync] No name conflicts found in ftrack for: "${playlist.name}"`,
      );
      return { hasConflict: false };
    } catch (error) {
      console.error(
        `[PlaylistSync] Failed to check for name conflicts in ftrack:`,
        error,
      );
      // If we can't check, proceed with sync (fallback to original error handling)
      return { hasConflict: false };
    }
  }

  /**
   * Parses ftrack error to detect duplicate name conflicts
   */
  private parseFtrackDuplicateError(error: Error): {
    isDuplicate: boolean;
    playlistName?: string;
  } {
    const errorMessage = error.message;

    // Pattern to match: "Duplicate entry 46856606-e7a8-4e09-ac78-0aa0dbd18e80-ASE w/ GFX for AssetVersionList unique on project_id, name."
    const duplicatePattern =
      /Duplicate entry .+ for AssetVersionList unique on project_id, name/i;

    if (duplicatePattern.test(errorMessage)) {
      // Try to extract playlist name from the error message
      // The pattern is usually: "Duplicate entry [UUID]-[PLAYLIST_NAME] for AssetVersionList..."
      const nameMatch = errorMessage.match(
        /Duplicate entry [^-]+-(.+?) for AssetVersionList/,
      );
      const playlistName = nameMatch ? nameMatch[1] : undefined;

      return { isDuplicate: true, playlistName };
    }

    return { isDuplicate: false };
  }

  /**
   * Handles sync conflict by emitting event for UI to show conflict dialog
   */
  private handleSyncConflict(playlist: PlaylistEntity, error: Error): void {
    const parseResult = this.parseFtrackDuplicateError(error);

    if (parseResult.isDuplicate) {
      console.debug(
        `[PlaylistSync] Name conflict detected for playlist: ${playlist.name}`,
      );

      this.emit("sync-name-conflict-detected", {
        playlistId: playlist.id,
        playlistName: playlist.name,
        playlistType: playlist.type,
        projectId: playlist.projectId,
        errorMessage: error.message,
      });
    } else {
      // Not a name conflict, re-throw the original error
      throw error;
    }
  }

  /**
   * Renames local playlist and retries sync
   */
  async resolveConflictAndRetry(
    playlistId: string,
    newName: string,
  ): Promise<void> {
    console.debug(
      `[PlaylistSync] Resolving conflict for ${playlistId} with new name: "${newName}"`,
    );

    try {
      // Update the playlist name locally
      console.debug(
        `[PlaylistSync] About to update playlist name in database: ${playlistId} -> "${newName}"`,
      );
      await this.repository.updatePlaylistName(playlistId, newName);
      console.debug(
        `[PlaylistSync] Successfully updated playlist name in database`,
      );

      // Clear cache to ensure fresh data
      this.cache.invalidate(playlistId);
      console.debug(
        `[PlaylistSync] Cache invalidated for playlist: ${playlistId}`,
      );

      // Emit resolution event
      console.debug(
        `[PlaylistSync] About to emit sync-conflict-resolved event`,
      );
      this.emit("sync-conflict-resolved", {
        playlistId,
        action: "renamed",
        newName,
      });
      console.debug(`[PlaylistSync] Emitted sync-conflict-resolved event`);

      // Emit playlist update event to notify UI of name change
      console.debug(`[PlaylistSync] About to emit playlist-updated event:`, {
        playlistId,
        updates: { name: newName },
      });
      this.emit("playlist-updated", {
        playlistId,
        updates: { name: newName },
      });
      console.debug(`[PlaylistSync] Emitted playlist-updated event`);

      // Retry the sync with the new name
      console.debug(
        `[PlaylistSync] Starting retry sync with new name: "${newName}"`,
      );
      await this.syncPlaylist(playlistId);
      console.debug(`[PlaylistSync] Retry sync completed successfully`);
    } catch (error) {
      console.error(
        `[PlaylistSync] Failed to resolve conflict for ${playlistId}:`,
        error,
      );

      // Mark sync as failed
      await this.repository.updatePlaylist(playlistId, {
        ftrackSyncStatus: "failed",
      });

      this.emit("sync-failed", {
        type: "sync-failed",
        playlistId,
        error:
          error instanceof Error ? error.message : "Failed to resolve conflict",
      } as PlaylistEvent);

      throw error;
    }
  }

  /**
   * Cancels sync due to conflict (user chose to handle in ftrack)
   */
  async cancelSyncDueToConflict(playlistId: string): Promise<void> {
    console.debug(
      `[PlaylistSync] Cancelling sync for ${playlistId} due to user choice`,
    );

    // Remove from active syncs
    this.activeSyncs.delete(playlistId);

    // Reset sync status
    await this.repository.updatePlaylist(playlistId, {
      ftrackSyncStatus: "not_synced",
    });

    // Emit resolution event
    this.emit("sync-conflict-resolved", {
      playlistId,
      action: "cancelled",
    });

    console.debug(`[PlaylistSync] Sync cancelled for playlist: ${playlistId}`);
  }

  // =================== PRIVATE METHODS ===================

  /**
   * Creates the playlist in ftrack based on its type
   */
  private async createInFtrack(playlist: PlaylistEntity) {
    const createRequest: CreatePlaylistRequest = {
      name: playlist.name,
      type: playlist.type,
      categoryId: playlist.categoryId,
      categoryName: playlist.categoryName,
      description: playlist.description,
      projectId: playlist.projectId,
    };

    let response;

    if (playlist.type === "reviewsession") {
      response = await this.ftrackService.createReviewSession(createRequest);
    } else {
      response = await this.ftrackService.createList(createRequest);
    }

    if (!response.success) {
      throw new Error(
        response.error || `Failed to create ${playlist.type} in ftrack`,
      );
    }

    console.log(`[PlaylistSync] Created ${playlist.type} in ftrack:`, {
      localId: playlist.id,
      ftrackId: response.id,
      name: playlist.name,
    });

    return response;
  }

  // =================== BULK OPERATIONS ===================

  /**
   * Syncs multiple playlists in parallel (with concurrency limit)
   */
  async syncMultiplePlaylists(
    playlistIds: string[],
    maxConcurrent = 3,
  ): Promise<void> {
    console.log(
      `[PlaylistSync] Starting bulk sync of ${playlistIds.length} playlists`,
    );

    // Process in batches to avoid overwhelming ftrack
    const batches = [];
    for (let i = 0; i < playlistIds.length; i += maxConcurrent) {
      batches.push(playlistIds.slice(i, i + maxConcurrent));
    }

    for (const batch of batches) {
      await Promise.allSettled(batch.map((id) => this.syncPlaylist(id)));
    }

    console.log(
      `[PlaylistSync] Completed bulk sync of ${playlistIds.length} playlists`,
    );
  }

  // =================== LIFECYCLE ===================

  destroy(): void {
    // Cancel all active syncs
    for (const playlistId of this.activeSyncs) {
      this.cancelSync(playlistId).catch((err) =>
        console.error(`Failed to cancel sync for ${playlistId}:`, err),
      );
    }

    this.removeAllListeners();
    console.log("[PlaylistSync] Destroyed");
  }
}
