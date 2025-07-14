/**
 * @fileoverview Playlist Store - Main API
 * Orchestrates all playlist operations through focused modules using stable UUIDs.
 * This is the public API that components will use.
 * NO ID CHANGES - playlists maintain stable UUIDs throughout their lifecycle.
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
import { PlaylistSync } from "./PlaylistSync";
import { DraftManager } from "./DraftManager";
import { ftrackPlaylistService } from "@/services/ftrack/FtrackPlaylistService";
import { PlaylistEntity, VersionEntity } from "./types";
import { Playlist, AssetVersion, CreatePlaylistRequest } from "@/types";
import { usePlaylistsStore } from "../playlistsStore";
import { useSettings } from "../settingsStore";

export class PlaylistStore extends SimpleEventEmitter {
  private repository = new PlaylistRepository();
  private cache = new PlaylistCache();
  private ftrackService = ftrackPlaylistService;
  private sync = new PlaylistSync(
    this.repository,
    this.cache,
    this.ftrackService,
  );
  private drafts = new DraftManager(this.repository);

  // Auto-refresh/polling state
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private isAutoRefreshing = false;
  private currentAutoRefreshPlaylistId: string | null = null;
  private static readonly AUTO_REFRESH_INTERVAL = 5000; // 5 seconds

  // Singleton initialization tracking
  private initializationPromises = new Map<string, Promise<void>>();

  constructor() {
    super();

    // Forward events from sync module to maintain backward compatibility
    this.sync.on("sync-started", (data: any) =>
      this.emit("sync-started", data),
    );
    this.sync.on("sync-completed", (data: any) =>
      this.emit("sync-completed", data),
    );
    this.sync.on("sync-failed", (data: any) => this.emit("sync-failed", data));

    // Forward conflict resolution events
    this.sync.on("sync-name-conflict-detected", (data: any) =>
      this.emit("sync-name-conflict-detected", data),
    );
    this.sync.on("sync-conflict-resolved", (data: any) =>
      this.emit("sync-conflict-resolved", data),
    );

    // Forward playlist update events for UI synchronization
    this.sync.on("playlist-updated", (data: any) => {
      console.debug(
        "🔄 [PlaylistStore] Forwarding playlist-updated event:",
        data,
      );
      this.emit("playlist-updated", data);
      console.debug(
        "🔄 [PlaylistStore] playlist-updated event forwarded successfully",
      );
    });

    console.log(
      "[PlaylistStore] Initialized with modular architecture and stable UUIDs",
    );
  }

  // =================== PLAYLIST OPERATIONS ===================

  /**
   * Creates a new playlist with a stable UUID that never changes
   */
  async createPlaylist(request: CreatePlaylistRequest): Promise<Playlist> {
    try {
      const id = crypto.randomUUID(); // Stable UUID - never changes
      const now = new Date().toISOString();

      console.log(`[PlaylistStore] Creating playlist with stable UUID: ${id}`);

      const entity: PlaylistEntity = {
        id,
        name: request.name,
        type: request.type,
        localStatus: request.ftrackId ? "synced" : "draft",
        ftrackSyncStatus: request.ftrackId ? "synced" : "not_synced",
        ftrackId: request.ftrackId,
        projectId: request.projectId,
        categoryId: request.categoryId,
        categoryName: request.categoryName,
        description: request.description,
        createdAt: now,
        updatedAt: now,
      };

      await this.repository.createPlaylist(entity);
      const playlist = this.entityToPlaylist(entity);
      this.cache.setPlaylist(id, playlist);

      console.log(
        `[PlaylistStore] Created playlist: ${id} - "${request.name}"`,
      );
      this.emit("playlist-created", { playlistId: id, playlist });

      return playlist;
    } catch (error) {
      console.error("[PlaylistStore] Failed to create playlist:", error);
      this.emit("playlist-error", {
        operation: "create",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Gets a playlist by its stable UUID
   */
  async getPlaylist(id: string): Promise<Playlist | null> {
    console.log(`[PlaylistStore] Getting playlist: ${id}`);

    // Check cache first
    let playlist = this.cache.getPlaylist(id);
    if (playlist) {
      console.log(`[PlaylistStore] Cache hit for playlist: ${id}`);
      return playlist;
    }

    // Load from database
    const entity = await this.repository.getPlaylist(id);
    if (entity) {
      // Load versions
      const versions = await this.repository.getPlaylistVersions(id);

      // Convert to UI model
      playlist = this.entityToPlaylist(entity, versions);
      this.cache.setPlaylist(id, playlist);

      console.log(
        `[PlaylistStore] Loaded playlist: ${id} with ${versions.length} versions`,
      );
      return playlist;
    }

    // CRITICAL FIX: If not found in database, check UI store and create database entry if needed
    const { playlists } = usePlaylistsStore.getState();
    const uiPlaylist = playlists.find((p) => p.id === id);

    if (uiPlaylist) {
      console.log(
        `[PlaylistStore] Found playlist in UI store but not database: ${id} - creating database entry`,
      );

      // CRITICAL FIX: Don't save ftrack native playlists to database - they should remain in UI store only
      const isLocalPlaylist = uiPlaylist.isLocalOnly;
      const isQuickNotes = id.startsWith("quick-notes-");
      const isFtrackNative = !isLocalPlaylist && !isQuickNotes;

      console.log(
        `[PlaylistStore] Playlist type analysis - isLocal: ${isLocalPlaylist}, isQuickNotes: ${isQuickNotes}, isFtrackNative: ${isFtrackNative}`,
      );

      if (isFtrackNative) {
        console.log(
          `[PlaylistStore] Skipping database save for ftrack native playlist: ${id} - keeping in UI store only`,
        );

        // Convert UI playlist to our format and cache it - sanitize to avoid DataCloneError
        playlist = {
          id: String(uiPlaylist.id),
          name: String(uiPlaylist.name || "Untitled"),
          title: String(uiPlaylist.title || uiPlaylist.name || "Untitled"),
          type: uiPlaylist.type || "list",
          versions: Array.isArray(uiPlaylist.versions)
            ? uiPlaylist.versions.map((v) => ({
                ...v,
                // Ensure all version fields are serializable
                id: String(v.id),
                name: String(v.name || ""),
                version: Number(v.version) || 0,
                thumbnailUrl: String(v.thumbnailUrl || ""),
                thumbnailId: String(v.thumbnailId || ""),
                reviewSessionObjectId: String(v.reviewSessionObjectId || ""),
                createdAt:
                  typeof v.createdAt === "string"
                    ? v.createdAt
                    : new Date().toISOString(),
                updatedAt:
                  typeof v.updatedAt === "string"
                    ? v.updatedAt
                    : new Date().toISOString(),
                manuallyAdded: Boolean(v.manuallyAdded),
              }))
            : [],
          notes: Array.isArray(uiPlaylist.notes) ? uiPlaylist.notes : [],
          createdAt:
            typeof uiPlaylist.createdAt === "string"
              ? uiPlaylist.createdAt
              : new Date().toISOString(),
          updatedAt:
            typeof uiPlaylist.updatedAt === "string"
              ? uiPlaylist.updatedAt
              : new Date().toISOString(),
          isLocalOnly: Boolean(uiPlaylist.isLocalOnly),
          ftrackSyncState: uiPlaylist.ftrackSyncState || "synced", // Ftrack native playlists are always synced
          categoryId: uiPlaylist.categoryId
            ? String(uiPlaylist.categoryId)
            : undefined,
          categoryName: uiPlaylist.categoryName
            ? String(uiPlaylist.categoryName)
            : undefined,
        };

        this.cache.setPlaylist(id, playlist);
        console.log(
          `[PlaylistStore] Cached ftrack native playlist without database save: ${id}`,
        );
        return playlist;
      }

      // Create database entry for local playlists and Quick Notes only
      const playlistEntity: PlaylistEntity = {
        id: id,
        name: String(uiPlaylist.name || "Untitled"),
        type:
          uiPlaylist.type === "reviewsession" || uiPlaylist.type === "list"
            ? uiPlaylist.type
            : "list",
        localStatus: isLocalPlaylist ? "draft" : "synced",
        ftrackSyncStatus: isLocalPlaylist ? "not_synced" : "synced",
        ftrackId: undefined, // ftrackId should only be set after successful sync, not during initialization
        projectId: "none", // Default for Quick Notes and other UI playlists
        createdAt:
          typeof uiPlaylist.createdAt === "string"
            ? uiPlaylist.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof uiPlaylist.updatedAt === "string"
            ? uiPlaylist.updatedAt
            : new Date().toISOString(),
      };

      // Use safe initialization to prevent race conditions
      await this.safeInitializePlaylist(id, playlistEntity);

      // Convert UI playlist to our format and cache it - sanitize to avoid DataCloneError
      playlist = {
        id: String(uiPlaylist.id),
        name: String(uiPlaylist.name || "Untitled"),
        title: String(uiPlaylist.title || uiPlaylist.name || "Untitled"),
        type: uiPlaylist.type || "list",
        versions: Array.isArray(uiPlaylist.versions)
          ? uiPlaylist.versions.map((v) => ({
              ...v,
              // Ensure all version fields are serializable
              id: String(v.id),
              name: String(v.name || ""),
              version: Number(v.version) || 0,
              thumbnailUrl: String(v.thumbnailUrl || ""),
              thumbnailId: String(v.thumbnailId || ""),
              reviewSessionObjectId: String(v.reviewSessionObjectId || ""),
              createdAt:
                typeof v.createdAt === "string"
                  ? v.createdAt
                  : new Date().toISOString(),
              updatedAt:
                typeof v.updatedAt === "string"
                  ? v.updatedAt
                  : new Date().toISOString(),
              manuallyAdded: Boolean(v.manuallyAdded),
            }))
          : [],
        notes: Array.isArray(uiPlaylist.notes) ? uiPlaylist.notes : [],
        createdAt:
          typeof uiPlaylist.createdAt === "string"
            ? uiPlaylist.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof uiPlaylist.updatedAt === "string"
            ? uiPlaylist.updatedAt
            : new Date().toISOString(),
        isLocalOnly: Boolean(uiPlaylist.isLocalOnly),
        ftrackSyncState: uiPlaylist.ftrackSyncState || "pending",
        categoryId: uiPlaylist.categoryId
          ? String(uiPlaylist.categoryId)
          : undefined,
        categoryName: uiPlaylist.categoryName
          ? String(uiPlaylist.categoryName)
          : undefined,
      };

      this.cache.setPlaylist(id, playlist);
      console.log(
        `[PlaylistStore] Created database entry and cached UI playlist: ${id}`,
      );
      return playlist;
    }

    console.log(`[PlaylistStore] Playlist not found: ${id}`);
    return null;
  }

  /**
   * CRITICAL FIX: Loads and merges versions from database AND ftrack
   * This fixes the persistence issue where manually added versions disappear on reload
   */
  async loadAndMergeVersions(
    playlistId: string,
    ftrackVersions: AssetVersion[],
  ): Promise<AssetVersion[]> {
    console.log(
      `[PlaylistStore] Loading and merging versions for playlist: ${playlistId}`,
    );

    // 1. Load existing versions from database first
    const databaseVersions =
      await this.repository.getPlaylistVersions(playlistId);
    console.log(
      `[PlaylistStore] Found ${databaseVersions.length} versions in database`,
    );

    // 2. Convert database versions to AssetVersion format
    const dbAssetVersions = databaseVersions.map((v) =>
      this.entityToAssetVersion(v),
    );

    // 3. Create version maps for efficient merging
    const dbVersionMap = new Map(dbAssetVersions.map((v) => [v.id, v]));
    const ftrackVersionMap = new Map(ftrackVersions.map((v) => [v.id, v]));

    // 4. Merge logic: Database versions take precedence for draft content and manual additions
    const mergedVersions: AssetVersion[] = [];

    // Add all database versions (these include manual additions and draft content)
    for (const dbVersion of dbAssetVersions) {
      const ftrackVersion = ftrackVersionMap.get(dbVersion.id);

      if (ftrackVersion) {
        // Version exists in both - merge with database taking precedence for user data
        const mergedVersion = {
          ...ftrackVersion, // Base ftrack data
          ...dbVersion, // Override with database data (drafts, manual flags, etc.)
        } as AssetVersion;
        mergedVersions.push(mergedVersion);
      } else {
        // Version only in database (manually added) - keep it
        mergedVersions.push(dbVersion);
      }
    }

    // Add ftrack-only versions (new versions from API)
    for (const ftrackVersion of ftrackVersions) {
      if (!dbVersionMap.has(ftrackVersion.id)) {
        mergedVersions.push(ftrackVersion);
      }
    }

    console.log(
      `[PlaylistStore] Merged ${mergedVersions.length} versions (${databaseVersions.length} from DB, ${ftrackVersions.length} from ftrack)`,
    );

    // 5. Store any new ftrack versions in database for future persistence
    const newFtrackVersions = ftrackVersions.filter(
      (v) => !dbVersionMap.has(v.id),
    );
    if (newFtrackVersions.length > 0) {
      console.log(
        `[PlaylistStore] Storing ${newFtrackVersions.length} new ftrack versions in database`,
      );
      await this.addVersionsToPlaylist(playlistId, newFtrackVersions);
    }

    return mergedVersions;
  }

  /**
   * Updates a playlist (ID never changes)
   */
  async updatePlaylist(
    id: string,
    updates: Partial<PlaylistEntity>,
  ): Promise<void> {
    await this.repository.updatePlaylist(id, updates);
    this.cache.invalidate(id);

    console.log(`[PlaylistStore] Updated playlist: ${id}`, updates);
    this.emit("playlist-updated", { playlistId: id, updates });
  }

  /**
   * Deletes a playlist and all its versions
   */
  async deletePlaylist(id: string): Promise<void> {
    await this.repository.deletePlaylist(id);
    this.cache.invalidate(id);

    console.log(`[PlaylistStore] Deleted playlist: ${id}`);
    this.emit("playlist-deleted", { playlistId: id });
  }

  // =================== VERSION OPERATIONS ===================

  /**
   * Adds versions to a playlist
   */
  async addVersionsToPlaylist(
    playlistId: string,
    versions: AssetVersion[],
  ): Promise<void> {
    // CRITICAL FIX: Ensure playlist exists in database before adding versions
    let playlist = await this.repository.getPlaylist(playlistId);

    if (!playlist) {
      // Check if playlist exists in UI store but not database
      const { playlists } = usePlaylistsStore.getState();
      const uiPlaylist = playlists.find((p) => p.id === playlistId);

      if (uiPlaylist) {
        console.log(
          `[PlaylistStore] Playlist ${playlistId} exists in UI but not database - creating database entry`,
        );

        // Create database entry for UI playlist - sanitize to avoid DataCloneError
        const playlistEntity: PlaylistEntity = {
          id: playlistId,
          name: String(uiPlaylist.name || "Untitled"),
          type:
            uiPlaylist.type === "reviewsession" || uiPlaylist.type === "list"
              ? uiPlaylist.type
              : "list",
          localStatus: uiPlaylist.isLocalOnly ? "draft" : "synced",
          ftrackSyncStatus: uiPlaylist.isLocalOnly ? "not_synced" : "synced",
          // CRITICAL FIX: Preserve ftrack metadata for ftrack native playlists
          ftrackId:
            uiPlaylist.ftrackId ||
            (uiPlaylist.isLocalOnly ? undefined : playlistId), // For ftrack native playlists, ftrackId = playlistId
          projectId: String(uiPlaylist.projectId || "none"), // Preserve project ID
          categoryId: uiPlaylist.categoryId, // Preserve category ID
          categoryName: uiPlaylist.categoryName, // Preserve category name
          description: uiPlaylist.description, // Preserve description
          createdAt:
            typeof uiPlaylist.createdAt === "string"
              ? uiPlaylist.createdAt
              : new Date().toISOString(),
          updatedAt:
            typeof uiPlaylist.updatedAt === "string"
              ? uiPlaylist.updatedAt
              : new Date().toISOString(),
          syncedAt: uiPlaylist.isLocalOnly
            ? undefined
            : new Date().toISOString(), // Mark ftrack native as synced
        };

        // Use safe initialization to prevent race conditions
        await this.safeInitializePlaylist(playlistId, playlistEntity);
        console.log(
          `[PlaylistStore] Created database entry for playlist: ${playlistId}`,
        );
      } else {
        // If it's Quick Notes specifically, initialize it
        if (playlistId.startsWith("quick-notes-")) {
          console.log(`[PlaylistStore] Quick Notes not found - initializing`);
          await this.initializeQuickNotes();
        } else {
          throw new Error(
            `Playlist ${playlistId} not found in database or UI store. Create it first.`,
          );
        }
      }
    }

    const versionEntities = versions.map((v) =>
      this.assetVersionToEntity(v, playlistId),
    );
    await this.repository.bulkAddVersions(playlistId, versionEntities);
    this.cache.invalidate(playlistId);

    console.log(
      `[PlaylistStore] Added ${versions.length} versions to playlist: ${playlistId}`,
    );
    this.emit("versions-added", { playlistId, versions });
  }

  /**
   * Gets versions for a playlist
   */
  async getPlaylistVersions(playlistId: string): Promise<VersionEntity[]> {
    return await this.repository.getPlaylistVersions(playlistId);
  }

  /**
   * Removes a version from a playlist
   */
  async removeVersionFromPlaylist(
    playlistId: string,
    versionId: string,
  ): Promise<void> {
    await this.repository.removeVersionFromPlaylist(playlistId, versionId);
    this.cache.invalidate(playlistId);

    console.log(
      `[PlaylistStore] Removed version ${versionId} from playlist: ${playlistId}`,
    );
    this.emit("version-removed", { playlistId, versionId });
  }

  // =================== SYNC OPERATIONS ===================

  /**
   * Syncs a playlist to ftrack WITHOUT changing its ID.
   * The playlist keeps its stable UUID, we just add ftrack metadata.
   */
  async syncPlaylist(playlistId: string): Promise<void> {
    console.log(`[PlaylistStore] Initiating sync for playlist: ${playlistId}`);
    return this.sync.syncPlaylist(playlistId);
  }

  /**
   * Checks sync status of a playlist
   */
  async getSyncStatus(
    playlistId: string,
  ): Promise<"not_synced" | "syncing" | "synced" | "failed"> {
    return this.sync.checkSyncStatus(playlistId);
  }

  /**
   * Gets all currently syncing playlists
   */
  getActiveSyncs(): string[] {
    return this.sync.getActiveSyncs();
  }

  /**
   * Cancels an active sync operation
   */
  async cancelSync(playlistId: string): Promise<void> {
    return this.sync.cancelSync(playlistId);
  }

  /**
   * Resolves a sync conflict by renaming the local playlist and retrying sync
   */
  async resolveConflictAndRetry(
    playlistId: string,
    newName: string,
  ): Promise<void> {
    await this.sync.resolveConflictAndRetry(playlistId, newName);
  }

  /**
   * Cancels sync due to name conflict (user chose to handle in ftrack)
   */
  async cancelSyncDueToConflict(playlistId: string): Promise<void> {
    await this.sync.cancelSyncDueToConflict(playlistId);
  }

  /**
   * Gets the ftrack ID for a synced playlist
   */
  async getFtrackId(playlistId: string): Promise<string | null> {
    const entity = await this.repository.getPlaylist(playlistId);
    return entity?.ftrackId || null;
  }

  /**
   * Refreshes a playlist by fetching latest versions from ftrack
   */
  async refreshPlaylist(playlistId: string): Promise<{
    success: boolean;
    addedCount?: number;
    removedCount?: number;
    addedVersions?: AssetVersion[];
    removedVersions?: AssetVersion[];
    error?: string;
  }> {
    try {
      console.debug(`[PlaylistStore] Refreshing playlist: ${playlistId}`);

      // Get playlist entity to access ftrackId
      const entity = await this.repository.getPlaylist(playlistId);
      if (!entity) {
        throw new Error(`Playlist ${playlistId} not found`);
      }

      if (!entity.ftrackId) {
        console.debug(
          `[PlaylistStore] Cannot refresh local-only playlist: ${playlistId}`,
        );
        return {
          success: false,
          error: "Local-only playlist cannot be refreshed",
        };
      }

      // Check for name changes by fetching playlist details from ftrack
      let nameUpdated = false;
      try {
        // Get playlist details from ftrack to check name
        let ftrackPlaylist: any = null;
        if (entity.type === "reviewsession") {
          const reviewSessions = await this.ftrackService.getPlaylists(
            entity.projectId,
          );
          ftrackPlaylist = reviewSessions.find((p) => p.id === entity.ftrackId);
        } else {
          const lists = await this.ftrackService.getLists(entity.projectId);
          ftrackPlaylist = lists.find((p) => p.id === entity.ftrackId);
        }

        // Check if name differs and update if necessary
        if (ftrackPlaylist && ftrackPlaylist.name !== entity.name) {
          console.debug(
            `[PlaylistStore] Playlist name changed in ftrack: "${entity.name}" -> "${ftrackPlaylist.name}"`,
          );

          // Update local name to match ftrack
          await this.repository.updatePlaylistName(
            playlistId,
            ftrackPlaylist.name,
          );

          // Clear cache to force reload with new name
          this.cache.invalidate(playlistId);

          // Emit playlist update event to notify UI
          this.emit("playlist-updated", {
            playlistId,
            updates: { name: ftrackPlaylist.name },
          });

          nameUpdated = true;
          console.debug(
            `[PlaylistStore] Local playlist name updated to match ftrack: "${ftrackPlaylist.name}"`,
          );
        }
      } catch (error) {
        console.warn(
          `[PlaylistStore] Failed to check playlist name in ftrack:`,
          error,
        );
        // Continue with version refresh even if name check fails
      }

      // Fetch fresh versions from ftrack
      const freshVersions = await this.ftrackService.getPlaylistVersions(
        entity.ftrackId,
      );

      // CRITICAL FIX: If playlist returns empty and ftrack service logs "Playlist not found", remove entire playlist
      if (freshVersions.length === 0) {
        console.debug(
          `[PlaylistStore] Playlist ${entity.ftrackId} returned no versions - checking if it was deleted from ftrack`,
        );

        // Get current versions to see if playlist had versions before
        const currentVersions =
          await this.repository.getPlaylistVersions(playlistId);
        const nonManualVersions = currentVersions.filter(
          (v) => !v.isRemoved && !v.manuallyAdded,
        );

        // If playlist had ftrack versions before but now returns empty, it was likely deleted
        if (nonManualVersions.length > 0) {
          console.debug(
            `🗑️  [CLEANUP] Playlist ${entity.name} (ftrackId: ${entity.ftrackId}) appears to be deleted from ftrack - removing from database`,
          );

          try {
            // Remove entire playlist from database
            await this.deletePlaylist(playlistId);

            console.debug(
              `✅ [CLEANUP] Successfully removed deleted playlist from database: ${entity.name}`,
            );
            this.emit("playlist-deleted", {
              playlistId,
              reason: "deleted-from-ftrack",
            });

            return {
              success: true,
              addedCount: 0,
              removedCount: 0,
              addedVersions: [],
              removedVersions: [],
              error:
                "Playlist was deleted from ftrack and removed from database",
            };
          } catch (deleteError) {
            console.error(
              `❌ [CLEANUP] Failed to remove deleted playlist ${entity.name}:`,
              deleteError,
            );
            return {
              success: false,
              error: `Failed to remove deleted playlist: ${deleteError instanceof Error ? deleteError.message : "Unknown error"}`,
            };
          }
        }
      }

      // Get current versions
      const currentVersions =
        await this.repository.getPlaylistVersions(playlistId);
      const currentVersionIds = new Set(
        currentVersions.filter((v) => !v.isRemoved).map((v) => v.id),
      );
      const freshVersionIds = new Set(freshVersions.map((v) => v.id));

      // Calculate changes
      const addedVersions = freshVersions.filter(
        (v) => !currentVersionIds.has(v.id),
      );

      // CRITICAL FIX: Only remove ftrack versions, preserve manually added versions
      // Get currently active (non-removed) versions that are not in fresh versions
      const removedVersionEntities = currentVersions.filter(
        (currentVersion) => {
          // Only consider versions that are currently active (not already removed)
          if (currentVersion.isRemoved) return false;
          // Only remove if it's not in fresh versions AND it's not manually added
          return (
            !freshVersionIds.has(currentVersion.id) &&
            !currentVersion.manuallyAdded
          );
        },
      );

      // Convert removed entities to AssetVersion format for consistency
      const removedVersions = removedVersionEntities.map((entity) =>
        this.entityToAssetVersion(entity),
      );

      // Apply changes to database
      if (addedVersions.length > 0) {
        await this.addVersionsToPlaylist(playlistId, addedVersions);
      }

      if (removedVersionEntities.length > 0) {
        for (const versionEntity of removedVersionEntities) {
          await this.removeVersionFromPlaylist(playlistId, versionEntity.id);
        }
      }

      // Clear cache to force reload
      this.cache.invalidate(playlistId);

      console.debug(
        `[PlaylistStore] Refreshed playlist ${playlistId}: +${addedVersions.length} -${removedVersions.length}${nameUpdated ? " (name updated)" : ""}`,
      );

      // Emit detailed refresh event with version data
      this.emit("playlist-refreshed", {
        playlistId,
        addedCount: addedVersions.length,
        removedCount: removedVersions.length,
        addedVersions,
        removedVersions,
        nameUpdated,
      });

      return {
        success: true,
        addedCount: addedVersions.length,
        removedCount: removedVersions.length,
        addedVersions,
        removedVersions,
      };
    } catch (error) {
      console.error(
        `[PlaylistStore] Failed to refresh playlist ${playlistId}:`,
        error,
      );
      this.emit("playlist-error", {
        operation: "refresh",
        playlistId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // =================== DRAFT OPERATIONS ===================

  /**
   * Saves draft content for a version
   */
  async saveDraft(
    playlistId: string,
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<void> {
    await this.drafts.saveDraft(playlistId, versionId, content, labelId);
    this.cache.invalidate(playlistId); // Invalidate to show updated draft

    this.emit("draft-saved", { playlistId, versionId, content, labelId });
  }

  /**
   * Gets draft content for a version
   */
  async getDraftContent(
    playlistId: string,
    versionId: string,
  ): Promise<string | null> {
    return this.drafts.getDraftContent(playlistId, versionId);
  }

  /**
   * Clears draft content for a version
   */
  async clearDraft(playlistId: string, versionId: string): Promise<void> {
    await this.drafts.clearDraft(playlistId, versionId);
    this.cache.invalidate(playlistId);

    this.emit("draft-cleared", { playlistId, versionId });
  }

  /**
   * Publishes a note
   */
  async publishNote(playlistId: string, versionId: string): Promise<void> {
    await this.drafts.publishNote(playlistId, versionId);
    this.cache.invalidate(playlistId);

    this.emit("note-published", { playlistId, versionId });
  }

  // =================== UTILITY METHODS ===================

  /**
   * Gets cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clears all caches
   */
  clearCache(): void {
    this.cache.clear();
    console.log("[PlaylistStore] Cleared all caches");
  }

  /**
   * Gets playlist count
   */
  async getPlaylistCount(): Promise<number> {
    return this.repository.getPlaylistCount();
  }

  /**
   * Gets all playlists for a project
   */
  async getPlaylistsByProject(projectId: string): Promise<Playlist[]> {
    const entities = await this.repository.getPlaylistsByProject(projectId);
    return Promise.all(
      entities.map(async (entity) => {
        const versions = await this.repository.getPlaylistVersions(entity.id);
        return this.entityToPlaylist(entity, versions);
      }),
    );
  }

  /**
   * Validates if a playlist name is available within a project and type
   * @param name The playlist name to validate
   * @param projectId The project ID to check within
   * @param type The playlist type to check within
   * @returns Error message if name exists, null if available
   */
  async validatePlaylistName(
    name: string,
    projectId: string,
    type: "reviewsession" | "list",
  ): Promise<string | null> {
    if (!name.trim() || !projectId) {
      return null;
    }

    try {
      const existingPlaylist = await this.repository.findByNameProjectAndType(
        name.trim(),
        projectId,
        type,
      );
      if (existingPlaylist) {
        return `A ${type} named "${name}" already exists.`;
      }
      return null; // No conflict
    } catch (error) {
      console.error("[PlaylistStore] Failed to validate playlist name:", error);
      return "Failed to validate playlist name";
    }
  }

  // =================== CONVERSION METHODS ===================

  private entityToPlaylist(
    entity: PlaylistEntity,
    versions?: VersionEntity[],
  ): Playlist {
    return {
      id: entity.id, // STABLE UUID - never changes
      name: entity.name,
      title: entity.name,
      type: entity.type,
      versions: versions
        ? versions.map((v) => this.entityToAssetVersion(v))
        : [],
      notes: [], // Notes are separate from versions in this architecture
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,

      // CRITICAL FIX: Include ftrackId from database entity
      ftrackId: entity.ftrackId,

      // Status mapping for UI compatibility
      // CRITICAL FIX: Quick Notes should NEVER be considered local only
      isLocalOnly: entity.id.startsWith("quick-notes-")
        ? false
        : entity.localStatus !== "synced",
      ftrackSyncState:
        entity.ftrackSyncStatus === "not_synced"
          ? "pending"
          : entity.ftrackSyncStatus,

      // CRITICAL FIX: Add isQuickNotes flag
      isQuickNotes: entity.id.startsWith("quick-notes-"),

      // Additional metadata - CRITICAL FIX: Include ALL entity fields
      projectId: entity.projectId,
      categoryId: entity.categoryId,
      categoryName: entity.categoryName,
      description: entity.description,
    };
  }

  private entityToAssetVersion(entity: VersionEntity): AssetVersion {
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      thumbnailUrl: entity.thumbnailUrl,
      thumbnailId: entity.thumbnailId,
      reviewSessionObjectId: entity.reviewSessionObjectId,
      createdAt: entity.createdAt || new Date().toISOString(),
      updatedAt: entity.updatedAt || new Date().toISOString(),
      manuallyAdded: entity.manuallyAdded,
    };
  }

  private assetVersionToEntity(
    version: AssetVersion,
    playlistId: string,
  ): VersionEntity {
    // Sanitize all fields to prevent DataCloneError - ensure everything is serializable
    return {
      id: String(version.id || ""),
      playlistId: String(playlistId || ""),
      name: String(version.name || ""),
      version: Number(version.version) || 0,
      thumbnailUrl:
        typeof version.thumbnailUrl === "string" ? version.thumbnailUrl : "",
      thumbnailId:
        typeof version.thumbnailId === "string" ? version.thumbnailId : "",
      reviewSessionObjectId:
        typeof version.reviewSessionObjectId === "string"
          ? version.reviewSessionObjectId
          : "",
      draftContent: undefined,
      labelId: "",
      noteStatus: "empty",
      addedAt: new Date().toISOString(),
      lastModified: Date.now(),
      // CRITICAL FIX: For synced playlists, versions from ftrack should be manuallyAdded: false
      // Only user-added versions should be manuallyAdded: true
      manuallyAdded: Boolean(version.manuallyAdded),
      createdAt:
        typeof version.createdAt === "string"
          ? version.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof version.updatedAt === "string"
          ? version.updatedAt
          : new Date().toISOString(),
    };
  }

  // =================== AUTO-REFRESH OPERATIONS ===================

  /**
   * Starts auto-refresh polling for a playlist
   * Integrates with settings store and prevents race conditions
   */
  async startAutoRefresh(
    playlistId: string,
    callback?: (result: {
      success: boolean;
      addedCount?: number;
      removedCount?: number;
      addedVersions?: AssetVersion[];
      removedVersions?: AssetVersion[];
      error?: string;
    }) => void,
  ): Promise<void> {
    try {
      console.debug(
        `[PlaylistStore] Starting auto-refresh for playlist: ${playlistId}`,
      );

      // Check if auto-refresh is enabled in settings
      const { settings } = useSettings.getState();

      if (!settings.autoRefreshEnabled) {
        console.debug(
          `[PlaylistStore] Auto-refresh disabled in settings, not starting`,
        );
        return;
      }

      // Don't auto-refresh Quick Notes playlist
      if (playlistId.startsWith("quick-notes-")) {
        console.debug(
          `[PlaylistStore] Skipping auto-refresh for Quick Notes playlist`,
        );
        return;
      }

      // Get playlist entity to verify it can be refreshed
      const entity = await this.repository.getPlaylist(playlistId);
      if (!entity || !entity.ftrackId) {
        console.debug(
          `[PlaylistStore] Cannot auto-refresh local-only playlist: ${playlistId}`,
        );
        return;
      }

      // If we're already auto-refreshing this playlist, don't start another instance
      if (
        this.currentAutoRefreshPlaylistId === playlistId &&
        this.autoRefreshInterval
      ) {
        console.debug(
          `[PlaylistStore] Already auto-refreshing playlist: ${playlistId}`,
        );
        return;
      }

      // Stop any existing auto-refresh for different playlist
      if (this.currentAutoRefreshPlaylistId !== playlistId) {
        this.stopAutoRefresh();
      }

      this.currentAutoRefreshPlaylistId = playlistId;

      // Set up periodic refresh
      this.autoRefreshInterval = setInterval(async () => {
        // Double-check settings and playlist haven't changed
        const currentSettings = useSettings.getState().settings;
        if (
          !currentSettings.autoRefreshEnabled ||
          this.currentAutoRefreshPlaylistId !== playlistId
        ) {
          this.stopAutoRefresh();
          return;
        }

        // Prevent overlapping refresh calls
        if (this.isAutoRefreshing) {
          console.debug(
            `[PlaylistStore] Auto-refresh already in progress for: ${playlistId}`,
          );
          return;
        }

        this.isAutoRefreshing = true;

        try {
          console.debug(
            `[PlaylistStore] Auto-refreshing playlist: ${playlistId}`,
          );
          const result = await this.refreshPlaylist(playlistId);

          // Emit auto-refresh specific event with version data
          this.emit("auto-refresh-completed", {
            playlistId,
            result,
          });

          // Call callback if provided
          if (callback) {
            callback(result);
          }

          // Log changes if any
          if (result.success && (result.addedCount || result.removedCount)) {
            console.debug(
              `[PlaylistStore] Auto-refresh found changes for ${playlistId}: +${result.addedCount || 0} -${result.removedCount || 0}`,
            );
          }
        } catch (error) {
          console.error(
            `[PlaylistStore] Auto-refresh failed for ${playlistId}:`,
            error,
          );

          const errorResult = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };

          this.emit("auto-refresh-failed", {
            playlistId,
            error: errorResult.error,
          });

          if (callback) {
            callback(errorResult);
          }
        } finally {
          this.isAutoRefreshing = false;
        }
      }, PlaylistStore.AUTO_REFRESH_INTERVAL);

      console.debug(
        `[PlaylistStore] Auto-refresh started for playlist: ${playlistId}`,
      );
    } catch (error) {
      console.error(
        `[PlaylistStore] Failed to start auto-refresh for ${playlistId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Stops auto-refresh polling
   */
  stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      console.debug(
        `[PlaylistStore] Stopping auto-refresh for playlist: ${this.currentAutoRefreshPlaylistId}`,
      );
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    this.isAutoRefreshing = false;
    this.currentAutoRefreshPlaylistId = null;

    console.debug(`[PlaylistStore] Auto-refresh stopped`);
  }

  /**
   * Checks if auto-refresh is currently active
   */
  isAutoRefreshActive(): boolean {
    return this.autoRefreshInterval !== null;
  }

  /**
   * Gets the currently auto-refreshing playlist ID
   */
  getCurrentAutoRefreshPlaylistId(): string | null {
    return this.currentAutoRefreshPlaylistId;
  }

  // =================== LEGACY COMPATIBILITY ===================

  /**
   * @deprecated Use startAutoRefresh instead of polling
   */
  stopPolling(): void {
    console.debug(
      "[PlaylistStore] stopPolling called - redirecting to stopAutoRefresh",
    );
    this.stopAutoRefresh();
  }

  /**
   * @deprecated Use startAutoRefresh instead of polling
   */
  async startPolling(
    playlistId: string,
    callback?: (
      added: any,
      removed: any,
      addedVersions: any,
      removedVersions: any,
      freshVersions: any,
    ) => void,
  ): Promise<void> {
    console.debug(
      "[PlaylistStore] startPolling called - redirecting to startAutoRefresh",
    );

    // Convert old callback format to new format
    const newCallback = callback
      ? (result: {
          success: boolean;
          addedCount?: number;
          removedCount?: number;
          error?: string;
        }) => {
          if (result.success) {
            callback(
              result.addedCount || 0,
              result.removedCount || 0,
              [],
              [],
              [],
            );
          }
        }
      : undefined;

    await this.startAutoRefresh(playlistId, newCallback);
  }

  // =================== BACKWARD COMPATIBILITY METHODS ===================

  /**
   * @deprecated Use addVersionsToPlaylist() with array instead
   * Legacy method for backward compatibility
   */
  async addVersionToPlaylist(
    playlistId: string,
    version: AssetVersion,
  ): Promise<void> {
    await this.addVersionsToPlaylist(playlistId, [version]);
  }

  /**
   * @deprecated Use saveDraft() and updatePlaylist() instead
   * Legacy method for backward compatibility
   */
  async saveNoteStatus(
    versionId: string,
    playlistId: string,
    status: string,
    content: string,
    labelId?: string | boolean,
  ): Promise<void> {
    // CRITICAL FIX for Issue #9: Properly save the note status instead of always calling saveDraft
    try {
      const labelIdStr = typeof labelId === "string" ? labelId : undefined;

      if (status === "published") {
        // For published notes, update the version record directly with published status
        await this.repository.updateVersion(playlistId, versionId, {
          noteStatus: "published",
          draftContent: content,
          labelId: labelIdStr,
          lastModified: Date.now(),
        });
        console.debug(
          `[PlaylistStore] Updated note status to PUBLISHED for version ${versionId}`,
        );
      } else {
        // For draft/empty notes, use the saveDraft flow which properly handles status logic
        await this.saveDraft(playlistId, versionId, content, labelIdStr);
      }

      // Clear cache to ensure fresh data
      this.cache.invalidate(playlistId);
    } catch (error) {
      console.error(
        `[PlaylistStore] Failed to save note status for ${versionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * @deprecated Use getPlaylistVersions() instead
   * Legacy method for backward compatibility
   */
  async getLocalPlaylistVersions(playlistId: string): Promise<VersionEntity[]> {
    return this.getPlaylistVersions(playlistId);
  }

  /**
   * @deprecated Use getPlaylist() instead
   * Legacy method for backward compatibility
   */
  async initializePlaylist(
    playlistId: string,
    _playlist: Playlist,
  ): Promise<void> {
    await this.getPlaylist(playlistId);
  }

  /**
   * @deprecated Use cache directly instead
   * Legacy method for backward compatibility
   */
  async cachePlaylist(playlist: Playlist): Promise<void> {
    this.cache.setPlaylist(playlist.id, playlist);
  }

  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility - returns playlist as-is
   */
  cleanPlaylistForStorage(playlist: Playlist): Playlist {
    return playlist;
  }

  /**
   * @deprecated Use saveDraft() instead
   * Legacy method for backward compatibility
   */
  async saveAttachments(
    _versionId: string,
    _playlistId: string,
    _attachments: any[],
  ): Promise<void> {
    // Attachments are handled by DraftManager
  }

  /**
   * @deprecated Use clearDraft() instead
   * Legacy method for backward compatibility
   */
  async clearAttachments(versionId: string, playlistId: string): Promise<void> {
    await this.clearDraft(playlistId, versionId);
  }

  /**
   * Clears all manually added versions from a playlist
   * CRITICAL FIX: This was a stub, now properly implemented
   */
  async clearAddedVersions(playlistId: string): Promise<void> {
    try {
      console.debug(
        `[PlaylistStore] Clearing manually added versions from playlist: ${playlistId}`,
      );

      // Get all manually added versions first
      const allVersions = await this.repository.getPlaylistVersions(playlistId);
      const manuallyAddedVersions = allVersions.filter((v) => v.manuallyAdded);

      console.debug(
        `[PlaylistStore] Found ${manuallyAddedVersions.length} manually added versions to remove`,
      );

      // Remove each manually added version
      for (const version of manuallyAddedVersions) {
        await this.repository.updateVersion(playlistId, version.id, {
          isRemoved: true,
        });
      }

      // Clear cache to force reload
      this.cache.invalidate(playlistId);

      console.debug(
        `[PlaylistStore] Cleared ${manuallyAddedVersions.length} manually added versions from playlist: ${playlistId}`,
      );
      this.emit("versions-cleared", {
        playlistId,
        count: manuallyAddedVersions.length,
      });
    } catch (error) {
      console.error(
        `[PlaylistStore] Failed to clear added versions from playlist ${playlistId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * @deprecated Not needed in new architecture
   * Legacy method for backward compatibility
   */
  async clearManuallyAddedFlags(
    _playlistId: string,
    _versionIds: string[],
  ): Promise<void> {
    // Not needed in new architecture
  }

  /**
   * @deprecated Use event listeners instead
   * Legacy method for backward compatibility
   */
  async updatePlaylistAndRestartPolling(
    playlistId: string,
    _callback?: (
      added: any,
      removed: any,
      addedVersions: any,
      removedVersions: any,
      freshVersions: any,
    ) => void,
  ): Promise<void> {
    // Stop current auto-refresh and restart it for the specified playlist
    this.stopAutoRefresh();
    await this.startAutoRefresh(playlistId);
  }

  /**
   * Safely initializes a playlist in the database if it doesn't exist
   * Prevents concurrent initialization calls using singleton pattern
   */
  private async safeInitializePlaylist(
    playlistId: string,
    playlistEntity: PlaylistEntity,
  ): Promise<void> {
    // Check if initialization is already in progress
    const existingPromise = this.initializationPromises.get(playlistId);
    if (existingPromise) {
      console.debug(
        `[PlaylistStore] Initialization already in progress for ${playlistId}, waiting...`,
      );
      return existingPromise;
    }

    // Create new initialization promise
    const initPromise = this.performPlaylistInitialization(
      playlistId,
      playlistEntity,
    );
    this.initializationPromises.set(playlistId, initPromise);

    try {
      await initPromise;
    } finally {
      // Clean up the promise when done
      this.initializationPromises.delete(playlistId);
    }
  }

  /**
   * Performs the actual playlist initialization work
   */
  private async performPlaylistInitialization(
    playlistId: string,
    playlistEntity: PlaylistEntity,
  ): Promise<void> {
    console.debug(`[PlaylistStore] Initializing playlist: ${playlistId}`);

    try {
      // First check if it already exists
      const existing = await this.repository.getPlaylist(playlistId);

      if (existing) {
        console.debug(
          `[PlaylistStore] Playlist ${playlistId} already exists in database`,
        );
        return;
      }

      // Try to create it
      await this.repository.createPlaylist(playlistEntity);
      console.debug(
        `[PlaylistStore] Created playlist ${playlistId} in database`,
      );
    } catch (error: any) {
      if (error.name === "ConstraintError") {
        // Another call succeeded - this is fine
        console.debug(
          `[PlaylistStore] Playlist ${playlistId} was created by concurrent call`,
        );
      } else {
        console.error(
          `[PlaylistStore] Error initializing playlist ${playlistId}:`,
          error,
        );
        throw error; // Re-throw non-constraint errors
      }
    }
  }

  /**
   * Initializes Quick Notes playlist in the database if it doesn't exist
   */
  async initializeQuickNotes(projectId?: string | null): Promise<void> {
    // Use current project ID or fall back to "none" for backward compatibility
    const currentProjectId = projectId ?? "none";
    const quickNotesId = `quick-notes-${currentProjectId}`;
    const now = new Date().toISOString();

    const quickNotesEntity: PlaylistEntity = {
      id: quickNotesId,
      name: "Quick Notes",
      type: "list",
      localStatus: "draft",
      ftrackSyncStatus: "not_synced",
      projectId: currentProjectId,
      createdAt: now,
      updatedAt: now,
    };

    return this.safeInitializePlaylist(quickNotesId, quickNotesEntity);
  }

  /**
   * Get the Quick Notes ID for a specific project
   */
  getQuickNotesId(projectId?: string | null): string {
    const currentProjectId = projectId ?? "none";
    return `quick-notes-${currentProjectId}`;
  }

  // =================== LIFECYCLE ===================

  /**
   * Destroys the store and cleans up resources
   */
  destroy(): void {
    console.debug(
      "[PlaylistStore] Destroying store and cleaning up auto-refresh",
    );
    this.stopAutoRefresh();
    this.sync.destroy();
    this.cache.destroy();
    this.removeAllListeners();

    console.debug("[PlaylistStore] Destroyed");
  }

  // =================== DEBUG UTILITIES ===================

  /**
   * Debug method to check current database state for a playlist
   */
  async debugPlaylistState(playlistId: string): Promise<any> {
    console.debug(`🔍 [Debug] Checking state for playlist: ${playlistId}`);

    try {
      // Check database
      const dbEntity = await this.repository.getPlaylist(playlistId);
      console.debug(`🔍 [Debug] Database entity:`, dbEntity);

      // Check cache
      const cachedPlaylist = this.cache.getPlaylist(playlistId);
      console.debug(`🔍 [Debug] Cached playlist:`, cachedPlaylist);

      // Check UI store
      const { playlists } = usePlaylistsStore.getState();
      const uiPlaylist = playlists.find((p) => p.id === playlistId);
      console.debug(`🔍 [Debug] UI store playlist:`, uiPlaylist);

      return {
        database: dbEntity,
        cache: cachedPlaylist,
        uiStore: uiPlaylist,
      };
    } catch (error) {
      console.error(`🔍 [Debug] Failed to check playlist state:`, error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

// Export singleton instance for backward compatibility
export const playlistStore = new PlaylistStore();

// Export classes for direct instantiation if needed
export { PlaylistRepository, PlaylistCache, PlaylistSync, DraftManager };

// Export types
export * from "./types";

// Expose debug utilities globally in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).debugPlaylistState =
    playlistStore.debugPlaylistState.bind(playlistStore);
}
