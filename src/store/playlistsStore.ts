/**
 * @fileoverview playlistsStore.ts
 * Global playlist state management using Zustand.
 * Features:
 * - Quick Notes playlist handling
 * - Active playlist tracking
 * - Playlist loading and updates
 * - Error state management
 */

import { create } from "zustand";
import { Playlist } from "@/types";
import { ftrackPlaylistService } from "../services/ftrack/FtrackPlaylistService";
import { db } from "./db";
import { useProjectStore } from "./projectStore";

// Helper function to create Quick Notes playlist for a project
const createQuickNotesPlaylist = (projectId: string | null): Playlist => ({
  id: `quick-notes-${projectId || "default"}`,
  name: "Quick Notes",
  title: "Quick Notes",
  notes: [],
  versions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isQuickNotes: true,
  isLocalOnly: false, // CRITICAL FIX: Quick Notes should never show as local only
});

interface PlaylistsState {
  playlists: Playlist[];
  activePlaylistId: string | null;
  isLoading: boolean;
  error: string | null;
  // Store state for open playlists and their loading status
  openPlaylistIds: string[];
  playlistStatus: Record<string, "idle" | "loading" | "loaded" | "error">;
  setPlaylists: (playlists: Playlist[]) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  // New Phase-2 actions
  fetchPlaylists: (projectId?: string | null) => Promise<void>;
  fetchVersionsForPlaylist: (playlistId: string) => Promise<void>;
  openPlaylist: (playlistId: string) => void;
  closePlaylist: (playlistId: string) => void;
  loadPlaylists: (projectId?: string | null) => Promise<{
    deletedPlaylists?: Array<{ id: string; name: string }>;
  }>;
  updatePlaylist: (playlistId: string) => Promise<void>;
  cleanupLocalPlaylists: () => Promise<void>;
  debugLocalPlaylists: () => Promise<void>;
  reset: () => void;
}

export const usePlaylistsStore = create<PlaylistsState>()((set, get) => {
  // NOTE: project change subscription is set up after store creation below

  return {
    playlists: [createQuickNotesPlaylist(null)],
    activePlaylistId: createQuickNotesPlaylist(null).id,
    isLoading: false,
    error: null,
    // Initialize open playlist state
    openPlaylistIds: [],
    playlistStatus: {},

    setPlaylists: (playlists) => {
      // Safety check: ensure playlists is an array
      if (!Array.isArray(playlists)) {
        console.error(
          "🔄 [PlaylistsStore] setPlaylists called with non-array:",
          typeof playlists,
          playlists,
        );
        return; // Don't update state with invalid data
      }

      // Always ensure Quick Notes is in the list
      const hasQuickNotes = playlists.some((p) => p.isQuickNotes);
      if (hasQuickNotes) {
        // Quick Notes is already in the list, use as-is
        set({ playlists });
      } else {
        // Quick Notes is missing, need to add it
        const { playlists: currentPlaylists } = get();
        const existingQuickNotes = currentPlaylists.find((p) => p.isQuickNotes);

        // Use existing Quick Notes if available, otherwise create new one
        const projectId = useProjectStore.getState().selectedProjectId;
        const quickNotesToAdd =
          existingQuickNotes || createQuickNotesPlaylist(projectId);
        const finalPlaylists = [quickNotesToAdd, ...playlists];
        set({ playlists: finalPlaylists });
      }
    },

    setActivePlaylist: (playlistId) => set({ activePlaylistId: playlistId }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    // Phase-2: new high-level actions
    fetchPlaylists: async (projectId?: string | null) => {
      // Delegate to existing loadPlaylists for now, but expose via new API
      try {
        set({ isLoading: true });
        await get().loadPlaylists(projectId);
      } finally {
        set({ isLoading: false });
      }
    },

    fetchVersionsForPlaylist: async (playlistId: string) => {
      const { playlistStatus } = get();
      // Prevent duplicate loads
      if (playlistStatus[playlistId] === "loading") return;

      // Optimistically set status to loading
      set((state) => ({
        playlistStatus: { ...state.playlistStatus, [playlistId]: "loading" },
      }));

      try {
        await get().updatePlaylist(playlistId);
        set((state) => ({
          playlistStatus: { ...state.playlistStatus, [playlistId]: "loaded" },
        }));
      } catch (e) {
        console.error(
          "[PlaylistsStore] Failed to fetch versions for",
          playlistId,
          e,
        );
        set((state) => ({
          playlistStatus: { ...state.playlistStatus, [playlistId]: "error" },
        }));
      }
    },

    openPlaylist: (playlistId: string) => {
      set((state) => {
        if (state.openPlaylistIds.includes(playlistId)) return {} as any;
        return { openPlaylistIds: [...state.openPlaylistIds, playlistId] };
      });
    },

    closePlaylist: (playlistId: string) => {
      set((state) => ({
        openPlaylistIds: state.openPlaylistIds.filter(
          (id) => id !== playlistId,
        ),
      }));
    },

    loadPlaylists: async (projectId?: string | null) => {
      const { setLoading, setError, setPlaylists } = get();
      setLoading(true);
      setError(null);

      let deletedPlaylists: Array<{ id: string; name: string }> = [];

      try {
        // AGGRESSIVE CLEANUP: Remove all old/broken local playlists FIRST
        try {
          console.log("Starting comprehensive cleanup of local playlists...");

          // Get ALL local playlists to inspect them
          const allLocalPlaylists: any[] = []; // Legacy table removed
          console.log("Total local playlists found:", allLocalPlaylists.length);

          // Aggressive cleanup conditions - remove playlists that are:
          const playlistsToDelete = allLocalPlaylists.filter((lp) => {
            // 1. Marked as synced
            if (lp.syncState === "synced") return true;

            // 2. Marked as not local only
            if (lp.isLocalOnly === false) return true;

            // 3. Have an ftrackId (means they were synced)
            if (lp.ftrackId) return true;

            // 4. Old playlists without proper local flags (legacy cleanup)
            if (lp.isLocalOnly === undefined && lp.syncState !== "pending")
              return true;

            // 5. Playlists older than 7 days without being synced (cleanup old abandoned playlists)
            const createdDate = new Date(lp.createdAt);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (createdDate < weekAgo && lp.syncState !== "pending")
              return true;

            return false;
          });

          if (playlistsToDelete.length > 0) {
            console.log(
              "Deleting",
              playlistsToDelete.length,
              "old/broken local playlists:",
              playlistsToDelete.map((p) => ({
                id: p.id,
                name: p.name,
                syncState: p.syncState,
                isLocalOnly: p.isLocalOnly,
                ftrackId: p.ftrackId,
              })),
            );

            // Delete the playlists and their associated data
            for (const playlist of playlistsToDelete) {
              await db.transaction("rw", [db.versions], async () => {
                // Legacy tables removed - only clean up versions
                console.log(
                  "Legacy playlist cleanup disabled for:",
                  playlist.id,
                );

                // Clean up versions that were marked for this local playlist
                await db.versions
                  .where("playlistId")
                  .equals(playlist.id)
                  .delete();
              });
            }

            console.log(
              "Comprehensive cleanup completed - deleted",
              playlistsToDelete.length,
              "playlists",
            );
          } else {
            console.log("No old playlists found to clean up");
          }
        } catch (error) {
          console.error("Failed to clean up old local playlists:", error);
        }

        // Get current count after cleanup
        const remainingLocalPlaylists: any[] = []; // Legacy table removed
        console.log(
          "Remaining local playlists after cleanup:",
          remainingLocalPlaylists.length,
        );

        // CRITICAL FIX: Load from NEW modular store database (db.playlists)
        // Also fix Issue #4: Load BOTH review sessions AND lists from ftrack
        // PROJECT FILTERING FIX: Pass projectId to ftrack service calls
        console.log(
          "Loading playlists from ftrack with project filter:",
          projectId,
        );
        const [reviewSessions, lists, databasePlaylists] = await Promise.all([
          ftrackPlaylistService.getPlaylists(projectId), // Review Sessions with project filter
          ftrackPlaylistService.getLists(projectId), // Lists with project filter
          // CRITICAL FIX: Load ONLY playlists for the current project from database
          projectId
            ? db.playlists.where("projectId").equals(projectId).toArray()
            : db.playlists.toArray(),
        ]);

        const fetchedPlaylists = [...reviewSessions, ...lists];

        console.log("Loaded playlists:", {
          ftrackCount: fetchedPlaylists.length,
          databaseCount: databasePlaylists.length,
          databasePlaylists: databasePlaylists.map((dp: any) => ({
            id: dp.id,
            name: dp.name,
            localStatus: dp.localStatus,
            ftrackSyncStatus: dp.ftrackSyncStatus,
            ftrackId: dp.ftrackId,
          })),
        });

        // CRITICAL FIX: Add Ftrack Validation - Flag orphaned database playlists that no longer exist in ftrack
        // FIX ISSUE #2: Make cleanup more conservative to prevent data loss when switching projects
        // Only consider a playlist "orphaned" if:
        // 1. It has a ftrackId (was synced to ftrack)
        // 2. It belongs to the CURRENT PROJECT (check projectId)
        // 3. It's not found in the current project's ftrack playlists
        // This prevents deleting playlists from other projects when switching

        const ftrackPlaylistIds = new Set(fetchedPlaylists.map((fp) => fp.id));
        const orphanedPlaylists = databasePlaylists.filter((dbPlaylist) => {
          // Skip local-only playlists (no ftrackId) - they're never orphaned
          if (!dbPlaylist.ftrackId) {
            return false;
          }

          // Skip playlists from other projects - they're not orphaned, just filtered
          if (
            projectId &&
            dbPlaylist.projectId &&
            dbPlaylist.projectId !== projectId
          ) {
            console.log(
              `⏭️  [CLEANUP] Skipping playlist from different project: ${dbPlaylist.name} (project: ${dbPlaylist.projectId}, current: ${projectId})`,
            );
            return false;
          }

          // Only consider orphaned if it was synced to current project but no longer exists there
          const isOrphaned = !ftrackPlaylistIds.has(dbPlaylist.ftrackId);
          if (isOrphaned) {
            console.log(
              `🧹 [CLEANUP] Found truly orphaned playlist: ${dbPlaylist.name} (ftrackId: ${dbPlaylist.ftrackId}, project: ${dbPlaylist.projectId})`,
            );
          }

          return isOrphaned;
        });

        if (orphanedPlaylists.length > 0) {
          console.log(
            `🧹 [CLEANUP] Found ${orphanedPlaylists.length} orphaned database playlists that no longer exist in ftrack:`,
            orphanedPlaylists.map((p) => ({
              id: p.id,
              name: p.name,
              ftrackId: p.ftrackId,
            })),
          );

          // Flag orphaned playlists as deleted in ftrack instead of removing them
          for (const orphanedPlaylist of orphanedPlaylists) {
            try {
              console.log(
                `🏷️  [CLEANUP] Flagging orphaned playlist as deleted in ftrack: ${orphanedPlaylist.name} (ftrackId: ${orphanedPlaylist.ftrackId})`,
              );

              // Flag playlist as deleted in ftrack instead of removing it
              await db.playlists.update(orphanedPlaylist.id, {
                deletedInFtrack: true,
              });

              // Track deleted playlist for UI updates
              deletedPlaylists.push({
                id: orphanedPlaylist.id,
                name: orphanedPlaylist.name,
              });

              console.log(
                `✅ [CLEANUP] Successfully flagged orphaned playlist as deleted: ${orphanedPlaylist.name}`,
              );
            } catch (error) {
              console.error(
                `❌ [CLEANUP] Failed to flag orphaned playlist ${orphanedPlaylist.name}:`,
                error,
              );
            }
          }

          // Reload database playlists after flagging
          const updatedDatabasePlaylists = await db.playlists.toArray();
          console.log(
            `🎯 [CLEANUP] Database cleanup complete. Total playlists: ${updatedDatabasePlaylists.length} (flagged ${orphanedPlaylists.length} as deleted)`,
          );

                    // Update the databasePlaylists array to reflect the flagging
          databasePlaylists.splice(0); // Clear original array
          databasePlaylists.push(...updatedDatabasePlaylists); // Add updated playlists
        }

        // PURGE: Hard-delete deleted playlists older than 7 days to prevent database bloat
        const DELETED_PLAYLIST_RETENTION_DAYS = 7;
        const retentionCutoff = new Date();
        retentionCutoff.setDate(retentionCutoff.getDate() - DELETED_PLAYLIST_RETENTION_DAYS);
        const retentionCutoffStr = retentionCutoff.toISOString();

        // Find deleted playlists that have expired retention period
        const expiredDeletedPlaylists = databasePlaylists.filter(
          (p: any) => p.deletedInFtrack && p.updatedAt < retentionCutoffStr,
        );

        if (expiredDeletedPlaylists.length > 0) {
          console.log(
            `🗑️ [PURGE] Found ${expiredDeletedPlaylists.length} deleted playlists older than ${DELETED_PLAYLIST_RETENTION_DAYS} days (cutoff: ${retentionCutoffStr}):`,
            expiredDeletedPlaylists.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })),
          );

          // Hard-delete expired deleted playlists and all associated data
          for (const playlist of expiredDeletedPlaylists) {
            try {
              console.log(`🗑️ [PURGE] Hard-deleting expired deleted playlist: ${playlist.name} (ID: ${playlist.id})`);

              // Delete playlist entity
              await db.playlists.delete(playlist.id);

              // Delete all versions (including soft-deleted ones) and associated data
              await db.transaction('rw', [db.versions, db.attachments, db.notes], async () => {
                // Delete all versions for this playlist
                const versionsToDelete = await db.versions.where('playlistId').equals(playlist.id).toArray();
                if (versionsToDelete.length > 0) {
                  await db.versions.bulkDelete(versionsToDelete.map(v => v.id));
                  console.log(`🗑️ [PURGE] Deleted ${versionsToDelete.length} versions for playlist ${playlist.id}`);
                }

                // Delete all attachments for this playlist
                const attachmentsToDelete = await db.attachments.where('playlistId').equals(playlist.id).toArray();
                if (attachmentsToDelete.length > 0) {
                  await db.attachments.bulkDelete(attachmentsToDelete.map(a => a.id));
                  console.log(`🗑️ [PURGE] Deleted ${attachmentsToDelete.length} attachments for playlist ${playlist.id}`);
                }

                // Delete all notes for this playlist
                const notesToDelete = await db.notes.where('playlistId').equals(playlist.id).toArray();
                if (notesToDelete.length > 0) {
                  await db.notes.bulkDelete(notesToDelete.map(n => n.id));
                  console.log(`🗑️ [PURGE] Deleted ${notesToDelete.length} notes for playlist ${playlist.id}`);
                }
              });

              console.log(`✅ [PURGE] Successfully purged deleted playlist: ${playlist.name}`);
            } catch (error) {
              console.error(`❌ [PURGE] Failed to purge deleted playlist ${playlist.id}:`, error);
            }
          }

          // Reload database playlists after purge
          const purgedDatabasePlaylists = projectId
            ? await db.playlists.where('projectId').equals(projectId).toArray()
            : await db.playlists.toArray();

          console.log(`🗑️ [PURGE] Database purge complete. Total playlists: ${databasePlaylists.length} -> ${purgedDatabasePlaylists.length} (removed ${expiredDeletedPlaylists.length})`);

          // Update the databasePlaylists array to reflect the purge
          databasePlaylists.splice(0);
          databasePlaylists.push(...purgedDatabasePlaylists);
        } else {
          console.log(`🗑️ [PURGE] No expired deleted playlists to purge (retention: ${DELETED_PLAYLIST_RETENTION_DAYS} days, cutoff: ${retentionCutoffStr})`);
        }

        // DEBUG: Let's also see what ftrack playlists we're getting
        console.log(
          "Ftrack playlists loaded:",
          fetchedPlaylists.slice(0, 5).map((fp) => ({
            id: fp.id,
            name: fp.name,
            type: fp.type || (fp as any).__entity_type__,
          })),
        );

        // CRITICAL FIX for Issue #4: Enhanced deduplication to prevent duplicate playlists after sync
        // RACE CONDITION FIX: Remove early filtering and check for duplicates atomically during storage
        console.log("Processing ftrack playlists with atomic deduplication:", {
          ftrackCount: fetchedPlaylists.length,
          databaseCount: databasePlaylists.length,
        });

        // CRITICAL FIX: Store ftrack playlists in database with atomic deduplication
        console.log(
          "Storing ftrack playlists in database with race-condition-safe deduplication...",
        );
        const formattedFtrackPlaylists = [];

        // CLEANUP: First, remove any duplicate database entries that may exist from previous race conditions
        console.log("🧹 Cleaning up any existing duplicate database entries...");
        const ftrackIdCounts = new Map<string, number>();
        for (const dbPlaylist of databasePlaylists) {
          if (dbPlaylist.ftrackId) {
            const count = ftrackIdCounts.get(dbPlaylist.ftrackId) || 0;
            ftrackIdCounts.set(dbPlaylist.ftrackId, count + 1);
          }
        }

        // Remove duplicates (keep the first one, delete the rest)
        for (const [ftrackId, count] of ftrackIdCounts.entries()) {
          if (count > 1) {
            console.log(`🗑️ Found ${count} duplicates for ftrackId ${ftrackId}, removing ${count - 1} duplicates`);
            const duplicates = await db.playlists.where("ftrackId").equals(ftrackId).toArray();
            // Keep the first one, delete the rest
            for (let i = 1; i < duplicates.length; i++) {
              await db.playlists.delete(duplicates[i].id);
              console.log(`🗑️ Deleted duplicate playlist: ${duplicates[i].id} (${duplicates[i].name})`);
            }
          }
        }

        // Reload database playlists after cleanup
        const cleanedDatabasePlaylists = projectId
          ? await db.playlists.where("projectId").equals(projectId).toArray()
          : await db.playlists.toArray();

        console.log(`🧹 Cleanup complete. Database playlists: ${databasePlaylists.length} -> ${cleanedDatabasePlaylists.length}`);

        // Convert cleaned database playlists to Playlist format and load their versions
        const databasePlaylistsFormatted: Playlist[] = await Promise.all(
          cleanedDatabasePlaylists.map(async (dbPlaylist: any) => {
            // Load versions for this database playlist
            const versions = await db.versions
              .where("playlistId")
              .equals(dbPlaylist.id)
              .and((v) => !v.isRemoved) // Only active versions
              .toArray();

            // Convert database versions to AssetVersion format
            const playlistVersions = versions.map((v) => ({
              id: v.id,
              name: v.name,
              version: v.version,
              thumbnailUrl: v.thumbnailUrl || "",
              thumbnailId: v.thumbnailId || "",
              reviewSessionObjectId: v.reviewSessionObjectId || "",
              createdAt: v.addedAt || v.createdAt,
              updatedAt: v.addedAt || v.updatedAt,
              manuallyAdded: v.manuallyAdded || false,
            }));

            console.log(
              `Loaded ${playlistVersions.length} versions for database playlist ${dbPlaylist.id}`,
            );

            const convertedPlaylist = {
              id: dbPlaylist.id,
              name: dbPlaylist.name,
              title: dbPlaylist.name,
              notes: [],
              versions: playlistVersions,
              createdAt: dbPlaylist.createdAt,
              updatedAt: dbPlaylist.updatedAt,
              // CRITICAL FIX: Include ftrackId from database
              ftrackId: dbPlaylist.ftrackId,
              // CRITICAL FIX: Include projectId from database for UI filtering
              projectId: dbPlaylist.projectId,
              // CRITICAL FIX: Quick Notes should NEVER be considered local only and should always have isQuickNotes flag
              isLocalOnly: dbPlaylist.id.startsWith("quick-notes-")
                ? false
                : dbPlaylist.localStatus === "draft" ||
                  dbPlaylist.ftrackSyncStatus === "not_synced",
              isQuickNotes: dbPlaylist.id.startsWith("quick-notes-"),
              ftrackSyncState:
                dbPlaylist.ftrackSyncStatus === "synced"
                  ? ("synced" as const)
                  : ("pending" as const),
              type: dbPlaylist.type,
              categoryId: dbPlaylist.categoryId,
              categoryName: dbPlaylist.categoryName,
              deletedInFtrack: dbPlaylist.deletedInFtrack || false,
            };

            return convertedPlaylist;
          }),
        );

        // RACE CONDITION FIX: Process all ftrack playlists atomically to prevent duplicates
        const playlistResults = await db.transaction('rw', db.playlists, async () => {
          const results = [];
          
          for (const ftrackPlaylist of fetchedPlaylists) {
            try {
              // ATOMIC: Check if we already have a database entry for this ftrack playlist
              const existingEntry = await db.playlists
                .where("ftrackId")
                .equals(ftrackPlaylist.id)
                .first();

              let playlistId: string;
              if (existingEntry) {
                // Use existing stable UUID
                playlistId = existingEntry.id;
                console.log(
                  `Using existing database entry for ftrack playlist ${ftrackPlaylist.id}: ${playlistId}`,
                );
              } else {
                // Generate new stable UUID for this ftrack playlist
                playlistId = crypto.randomUUID();
                console.log(
                  `Generated new stable UUID for ftrack playlist ${ftrackPlaylist.id}: ${playlistId}`,
                );

                // Create a clean serializable object for database storage
                const playlistEntity = {
                  id: playlistId, // STABLE UUID - never changes
                  name: String(ftrackPlaylist.name),
                  type: (ftrackPlaylist.type || "reviewsession") as
                    | "reviewsession"
                    | "list",
                  localStatus: "synced" as const, // Ftrack native playlists are already "synced"
                  ftrackSyncStatus: "synced" as const,
                  ftrackId: String(ftrackPlaylist.id), // External reference only
                  projectId: ftrackPlaylist.projectId
                    ? String(ftrackPlaylist.projectId)
                    : "", // Ensure string
                  categoryId: ftrackPlaylist.categoryId
                    ? String(ftrackPlaylist.categoryId)
                    : undefined,
                  categoryName: ftrackPlaylist.categoryName
                    ? String(ftrackPlaylist.categoryName)
                    : undefined,
                  description: ftrackPlaylist.description
                    ? String(ftrackPlaylist.description)
                    : undefined,
                  createdAt: ftrackPlaylist.createdAt
                    ? String(ftrackPlaylist.createdAt)
                    : new Date().toISOString(),
                  updatedAt: ftrackPlaylist.updatedAt
                    ? String(ftrackPlaylist.updatedAt)
                    : new Date().toISOString(),
                  syncedAt: new Date().toISOString(), // Mark as synced now
                };

                // ATOMIC: Store in database with stable UUID
                await db.playlists.put(playlistEntity);
                console.log(
                  `Stored ftrack playlist in database: ${ftrackPlaylist.id} -> ${playlistId} (${ftrackPlaylist.name})`,
                );
              }
              
              results.push({ ftrackPlaylist, playlistId });
            } catch (error) {
              console.error(
                `Failed to process ftrack playlist ${ftrackPlaylist.id}:`,
                error,
              );
              // Still include in results even if database operation failed
              results.push({ ftrackPlaylist, playlistId: ftrackPlaylist.id });
            }
          }
          
          return results;
        });

        // Format playlists for UI using the atomic transaction results
         for (const { ftrackPlaylist, playlistId } of playlistResults) {
            // Format for UI with stable UUID as id
            formattedFtrackPlaylists.push({
              ...ftrackPlaylist,
              id: playlistId, // Use stable UUID as playlist ID
              ftrackId: ftrackPlaylist.id, // Set ftrackId for refresh functionality
              projectId: ftrackPlaylist.projectId, // CRITICAL FIX: Explicitly preserve projectId for UI filtering
              isLocalOnly: false, // Ftrack native playlists are not local-only
              ftrackSyncState: "synced" as const, // Ftrack native playlists are already synced
            });
         }

        // DEDUPLICATION FIX: Filter out database playlists that have a corresponding ftrack playlist
        // to prevent showing duplicates in the UI
        const formattedFtrackIds = new Set(formattedFtrackPlaylists.map(p => p.id));
        const uniqueDatabasePlaylists = databasePlaylistsFormatted.filter(dbPlaylist => 
          !formattedFtrackIds.has(dbPlaylist.id)
        );

        console.log(`🔄 [DEDUP] Filtered ${databasePlaylistsFormatted.length - uniqueDatabasePlaylists.length} duplicate database playlists`);

        const allPlaylists = [
          ...formattedFtrackPlaylists,
          ...uniqueDatabasePlaylists,
        ];

        // FIX ISSUE #2: Filter playlists for UI based on current project
        // Keep ALL playlists in database, but only show current project's playlists in UI
        const filteredPlaylists = projectId
          ? allPlaylists.filter((playlist) => {
              // Always include Quick Notes regardless of project
              if (playlist.isQuickNotes) {
                return true;
              }

              // For project-specific playlists, only show those from current project
              // Check both projectId field and whether it's a local playlist
              const belongsToCurrentProject = playlist.projectId === projectId;
              const isLocalOnlyPlaylist =
                playlist.isLocalOnly && !playlist.ftrackId;

              if (belongsToCurrentProject || isLocalOnlyPlaylist) {
                console.log(
                  `✅ [FILTER] Including playlist in UI: ${playlist.name} (project: ${playlist.projectId}, isLocal: ${isLocalOnlyPlaylist})`,
                );
                return true;
              } else {
                console.log(
                  `⏭️  [FILTER] Hiding playlist from different project: ${playlist.name} (project: ${playlist.projectId}, current: ${projectId})`,
                );
                return false;
              }
            })
          : allPlaylists.filter(
              (playlist) =>
                // When no project selected, only show Quick Notes
                playlist.isQuickNotes,
            );

        // Do not preserve playlists flagged as deleted in ftrack on app reload
        const filteredWithoutDeleted = filteredPlaylists.filter(
          (p) => !p.deletedInFtrack,
        );

        console.log(
          `📊 [FILTER] Showing ${filteredWithoutDeleted.length} of ${allPlaylists.length} total playlists for project ${
            projectId || "none"
          } (excluded ${filteredPlaylists.length - filteredWithoutDeleted.length} deleted)`,
        );

        setPlaylists(filteredWithoutDeleted); // Hide deleted playlists in UI

        return {
          deletedPlaylists:
            deletedPlaylists.length > 0 ? deletedPlaylists : undefined,
        };
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Failed to load playlists",
        );
        console.error("Failed to load playlists:", error);
        return {
          deletedPlaylists:
            deletedPlaylists.length > 0 ? deletedPlaylists : undefined,
        };
      } finally {
        setLoading(false);
      }
    },

    updatePlaylist: async (playlistId) => {
      // Don't update Quick Notes from Ftrack
      if (playlistId.startsWith("quick-notes-")) return;

      const { setError, playlists, setPlaylists } = get();
      setError(null);

      try {
        const fresh = await ftrackPlaylistService.getPlaylists();
        const freshPlaylist = fresh.find((p) => p.id === playlistId);

        if (!freshPlaylist) {
          console.log("No playlist found with id:", playlistId);
          return;
        }

        // Update the playlist in the store
        const updatedPlaylists = playlists.map((p) =>
          p.id === playlistId ? freshPlaylist : p,
        );
        setPlaylists(updatedPlaylists);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Failed to update playlist",
        );
        console.error("Failed to update playlist:", error);
      }
    },

    cleanupLocalPlaylists: async () => {
      console.log(
        "🧹 Legacy cleanup disabled - use new playlist store instead",
      );

      try {
        // Legacy functionality disabled
        const allLocalPlaylists: any[] = []; // Legacy table removed
        console.log(
          "🔍 Total local playlists found:",
          allLocalPlaylists.length,
        );

        if (allLocalPlaylists.length > 0) {
          console.log(
            "📋 All local playlists:",
            allLocalPlaylists.map((p) => ({
              id: p.id,
              name: p.name,
              syncState: p.syncState,
              isLocalOnly: p.isLocalOnly,
              ftrackId: p.ftrackId,
              createdAt: p.createdAt,
            })),
          );
        }

        // NUCLEAR OPTION: Delete ALL local playlists that are not actively pending
        const playlistsToDelete = allLocalPlaylists.filter((lp) => {
          // Keep playlists that are:
          // 1. Explicitly pending and recently created (within last hour as safety)
          // 2. Successfully synced (to preserve history)
          const isRecentlyCreated =
            new Date(lp.createdAt) > new Date(Date.now() - 60 * 60 * 1000);
          const shouldKeep =
            (lp.syncState === "pending" &&
              (lp.isLocalOnly === true || lp.isLocalOnly === undefined) &&
              !lp.ftrackId &&
              isRecentlyCreated) ||
            (lp.syncState === "synced" && lp.ftrackId); // Always keep synced playlists

          return !shouldKeep; // Delete everything that shouldn't be kept
        });

        if (playlistsToDelete.length > 0) {
          console.log(
            "🗑️ NUCLEAR CLEANUP - Deleting",
            playlistsToDelete.length,
            "local playlists:",
            playlistsToDelete.map((p) => ({
              id: p.id,
              name: p.name,
              syncState: p.syncState,
              isLocalOnly: p.isLocalOnly,
              ftrackId: p.ftrackId,
            })),
          );

          // Delete the playlists and their associated data
          for (const playlist of playlistsToDelete) {
            await db.transaction("rw", [db.versions], async () => {
              // Legacy cleanup disabled
              console.log(
                "Legacy playlist deletion disabled for:",
                playlist.id,
              );

              // Clean up versions that were marked for this local playlist
              await db.versions
                .where("playlistId")
                .equals(playlist.id)
                .delete();
            });
          }

          console.log(
            "✅ Nuclear cleanup completed - deleted",
            playlistsToDelete.length,
            "playlists",
          );
        } else {
          console.log("✨ No playlists needed to be cleaned up");
        }

        // Show final count
        const finalCount = 0; // Legacy table removed
        console.log("📊 Final local playlist count:", finalCount);
      } catch (error) {
        console.error("❌ Failed to cleanup local playlists:", error);
      }
    },

    debugLocalPlaylists: async () => {
      console.log(
        "🔍 DEBUG: Legacy debug disabled - use new playlist store instead",
      );

      try {
        const allLocalPlaylists: any[] = []; // Legacy table removed
        const allLocalVersions: any[] = []; // Legacy table removed
        const allVersions = await db.versions.toArray();

        console.log("📊 Database counts:", {
          localPlaylists: allLocalPlaylists.length,
          localPlaylistVersions: allLocalVersions.length,
          versions: allVersions.length,
        });

        if (allLocalPlaylists.length > 0) {
          console.log(
            "📋 Local playlists breakdown:",
            allLocalPlaylists.map((p) => ({
              id: p.id,
              name: p.name,
              syncState: p.syncState,
              isLocalOnly: p.isLocalOnly,
              ftrackId: p.ftrackId,
              createdAt: p.createdAt,
              age:
                Math.round(
                  (Date.now() - new Date(p.createdAt).getTime()) /
                    (1000 * 60 * 60),
                ) + "h",
            })),
          );
        }

        // Group by state
        const byState = allLocalPlaylists.reduce(
          (acc, p) => {
            const state = p.syncState || "undefined";
            acc[state] = (acc[state] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        console.log("📊 Playlists by state:", byState);
      } catch (error) {
        console.error("❌ Failed to debug local playlists:", error);
      }
    },

    reset: () => {
      const projectId = useProjectStore.getState().selectedProjectId;
      const quickNotesPlaylist = createQuickNotesPlaylist(projectId);
      set({
        playlists: [quickNotesPlaylist],
        activePlaylistId: quickNotesPlaylist.id,
        isLoading: false,
        error: null,
        openPlaylistIds: [],
        playlistStatus: {},
      });
    },
  };
});

// Replace previous subscribe block with simple listener
let prevProjectId: string | null = null;
let fetchPlaylistsPromise: Promise<any> | null = null;

useProjectStore.subscribe(async (state) => {
  const newProjectId = state.selectedProjectId;
  if (newProjectId !== prevProjectId) {
    console.log(
      `[PlaylistsStore] Project switched from ${prevProjectId} to ${newProjectId}`,
    );

    // Cancel any ongoing fetchPlaylists request
    if (fetchPlaylistsPromise) {
      console.log(
        "[PlaylistsStore] Cancelling previous fetchPlaylists request",
      );
      fetchPlaylistsPromise = null;
    }

    const { fetchPlaylists, playlists, openPlaylistIds } =
      usePlaylistsStore.getState();
    const { playlistStore } = await import("./playlist");

    // Get the Quick Notes ID for the new project
    const quickNotesId = playlistStore.getQuickNotesId(newProjectId);

    // Initialize Quick Notes for the new project
    await playlistStore.initializeQuickNotes(newProjectId);

    // Close all playlists from other projects, keep only current project's Quick Notes
    const playlistsToClose = openPlaylistIds.filter((id) => {
      const playlist = playlists.find((p) => p.id === id);
      if (!playlist) return true; // Close unknown playlists

      // Keep Quick Notes for the new project
      if (playlist.isQuickNotes && id === quickNotesId) {
        return false;
      }

      // Close all other playlists (including Quick Notes from other projects)
      return true;
    });

    console.log(
      `[PlaylistsStore] Closing ${playlistsToClose.length} playlists from other projects:`,
      playlistsToClose,
    );

    // Reset state to the new project's Quick Notes
    usePlaylistsStore.setState({
      activePlaylistId: quickNotesId,
      openPlaylistIds: [quickNotesId],
      playlistStatus: {},
    });

    // Fetch playlists for the new project with debouncing
    if (newProjectId) {
      fetchPlaylistsPromise = fetchPlaylists(newProjectId)
        .then(() => {
          // CRITICAL FIX: Re-set the active playlist after playlists are loaded
          // This ensures the active playlist is properly highlighted in the UI
          const currentState = usePlaylistsStore.getState();
          if (currentState.activePlaylistId === quickNotesId) {
            console.log(
              `[PlaylistsStore] Re-setting active playlist to ensure UI highlighting: ${quickNotesId}`,
            );
            usePlaylistsStore.setState({ activePlaylistId: quickNotesId });
          }
        })
        .catch((e) => {
          console.error(
            "[PlaylistsStore] Failed to fetch playlists for project switch",
            e,
          );
        })
        .finally(() => {
          fetchPlaylistsPromise = null;
        });
    }
  }
  prevProjectId = newProjectId;
});

// Make debugging functions available globally
if (typeof window !== "undefined") {
  (window as any).debugLocalPlaylists = () =>
    usePlaylistsStore.getState().debugLocalPlaylists();
  (window as any).cleanupLocalPlaylists = () =>
    usePlaylistsStore.getState().cleanupLocalPlaylists();

  // Expose full store for debugging (Phase 2 support)
  (window as any).usePlaylistsStore = usePlaylistsStore;
}
