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

const QUICK_NOTES_PLAYLIST: Playlist = {
  id: "quick-notes",
  name: "Quick Notes",
  title: "Quick Notes",
  notes: [],
  versions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isQuickNotes: true,
  isLocalOnly: false, // CRITICAL FIX: Quick Notes should never show as local only
};

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
}

export const usePlaylistsStore = create<PlaylistsState>()((set, get) => {
  // NOTE: project change subscription is set up after store creation below

  return {
    playlists: [QUICK_NOTES_PLAYLIST],
    activePlaylistId: "quick-notes",
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
      const hasQuickNotes = playlists.some((p) => p.id === "quick-notes");
      if (hasQuickNotes) {
        // Quick Notes is already in the list, use as-is
        set({ playlists });
      } else {
        // Quick Notes is missing, need to add it
        const { playlists: currentPlaylists } = get();
        const existingQuickNotes = currentPlaylists.find(
          (p) => p.id === "quick-notes",
        );

        // Use existing Quick Notes if available, otherwise use default
        const quickNotesToAdd = existingQuickNotes || QUICK_NOTES_PLAYLIST;
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
          // Load ALL playlists from the new modular store database
          db.playlists.toArray(),
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

        // CRITICAL FIX: Add Ftrack Validation - Remove orphaned database playlists that no longer exist in ftrack
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

          // Remove orphaned playlists from database
          for (const orphanedPlaylist of orphanedPlaylists) {
            try {
              console.log(
                `🗑️  [CLEANUP] Removing orphaned playlist from database: ${orphanedPlaylist.name} (ftrackId: ${orphanedPlaylist.ftrackId})`,
              );

              // Remove playlist and all its versions from database
              await db.transaction(
                "rw",
                [db.playlists, db.versions],
                async () => {
                  await db.playlists.delete(orphanedPlaylist.id);
                  await db.versions
                    .where("playlistId")
                    .equals(orphanedPlaylist.id)
                    .delete();
                },
              );

              // Track deleted playlist for UI updates
              deletedPlaylists.push({
                id: orphanedPlaylist.id,
                name: orphanedPlaylist.name,
              });

              console.log(
                `✅ [CLEANUP] Successfully removed orphaned playlist: ${orphanedPlaylist.name}`,
              );
            } catch (error) {
              console.error(
                `❌ [CLEANUP] Failed to remove orphaned playlist ${orphanedPlaylist.name}:`,
                error,
              );
            }
          }

          // Reload database playlists after cleanup
          const cleanedDatabasePlaylists = await db.playlists.toArray();
          console.log(
            `🎯 [CLEANUP] Database cleanup complete. Remaining playlists: ${cleanedDatabasePlaylists.length} (removed ${orphanedPlaylists.length})`,
          );

          // Update the databasePlaylists array to reflect the cleanup
          databasePlaylists.splice(0); // Clear original array
          databasePlaylists.push(...cleanedDatabasePlaylists); // Add cleaned playlists
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

        // Convert database playlists to Playlist format and load their versions
        const databasePlaylistsFormatted: Playlist[] = await Promise.all(
          databasePlaylists.map(async (dbPlaylist: any) => {
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
              isLocalOnly:
                dbPlaylist.id === "quick-notes"
                  ? false
                  : dbPlaylist.localStatus === "draft" ||
                    dbPlaylist.ftrackSyncStatus === "not_synced",
              isQuickNotes: dbPlaylist.id === "quick-notes",
              ftrackSyncState:
                dbPlaylist.ftrackSyncStatus === "synced"
                  ? ("synced" as const)
                  : ("pending" as const),
              type: dbPlaylist.type,
              categoryId: dbPlaylist.categoryId,
              categoryName: dbPlaylist.categoryName,
            };

            return convertedPlaylist;
          }),
        );

        // CRITICAL FIX for Issue #4: Enhanced deduplication to prevent duplicate playlists after sync
        // If a playlist exists both in ftrack and database, prefer the database version (has local modifications)
        const ftrackIds = new Set(fetchedPlaylists.map((p) => p.id));
        const databaseIds = new Set(
          databasePlaylists.map((p) => p.ftrackId).filter(Boolean),
        );

        console.log("Deduplication data:", {
          ftrackCount: fetchedPlaylists.length,
          databaseCount: databasePlaylists.length,
          ftrackIds: Array.from(ftrackIds),
          databaseFtrackIds: Array.from(databaseIds),
        });

        // Enhanced filtering: exclude ftrack playlists that already have database entries
        const uniqueFtrackPlaylists = fetchedPlaylists.filter((fp) => {
          const isDuplicateByFtrackId = databaseIds.has(fp.id);

          // EXTRA DEBUG: Log every ftrack playlist being checked
          console.log("Deduplication check for ftrack playlist:", {
            ftrackId: fp.id,
            name: fp.name,
            isDuplicateByFtrackId,
            databaseHasFtrackId: databaseIds.has(fp.id),
            databaseFtrackIds: Array.from(databaseIds),
          });

          if (isDuplicateByFtrackId) {
            console.log(
              "✅ Excluding duplicate ftrack playlist (already in database):",
              {
                ftrackId: fp.id,
                name: fp.name,
              },
            );
          } else {
            console.log(
              "❌ Adding ftrack playlist (no database entry found):",
              {
                ftrackId: fp.id,
                name: fp.name,
              },
            );
          }

          return !isDuplicateByFtrackId;
        });

        console.log("After deduplication:", {
          uniqueFtrackPlaylists: uniqueFtrackPlaylists.length,
          databasePlaylists: databasePlaylistsFormatted.length,
        });

        // CRITICAL FIX: Store ftrack playlists in database so they have proper metadata on reload
        console.log(
          "Storing ftrack playlists in database for persistent metadata...",
        );
        const formattedFtrackPlaylists = [];

        for (const ftrackPlaylist of uniqueFtrackPlaylists) {
          try {
            // Check if we already have a database entry for this ftrack playlist
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

              // Store in database with stable UUID
              await db.playlists.put(playlistEntity);
              console.log(
                `Stored ftrack playlist in database: ${ftrackPlaylist.id} -> ${playlistId} (${ftrackPlaylist.name})`,
              );
            }

            // Format for UI with stable UUID as id
            formattedFtrackPlaylists.push({
              ...ftrackPlaylist,
              id: playlistId, // Use stable UUID as playlist ID
              ftrackId: ftrackPlaylist.id, // Set ftrackId for refresh functionality
              projectId: ftrackPlaylist.projectId, // CRITICAL FIX: Explicitly preserve projectId for UI filtering
              isLocalOnly: false, // Ftrack native playlists are not local-only
              ftrackSyncState: "synced" as const, // Ftrack native playlists are already synced
            });
          } catch (error) {
            console.error(
              `Failed to store ftrack playlist ${ftrackPlaylist.id}:`,
              error,
            );
            // Still add to UI even if database storage failed
            formattedFtrackPlaylists.push({
              ...ftrackPlaylist,
              ftrackId: ftrackPlaylist.id, // Set ftrackId for refresh functionality
              projectId: ftrackPlaylist.projectId, // CRITICAL FIX: Explicitly preserve projectId for UI filtering
              isLocalOnly: false, // Ftrack native playlists are not local-only
              ftrackSyncState: "synced" as const, // Ftrack native playlists are already synced
            });
          }
        }

        const allPlaylists = [
          ...formattedFtrackPlaylists,
          ...databasePlaylistsFormatted,
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

        console.log(
          `📊 [FILTER] Showing ${filteredPlaylists.length} of ${allPlaylists.length} total playlists for project ${projectId || "none"}`,
        );

        setPlaylists(filteredPlaylists); // Show only filtered playlists in UI

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
      if (playlistId === "quick-notes") return;

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
  };
});

// Replace previous subscribe block with simple listener
let prevProjectId: string | null = null;
useProjectStore.subscribe((state) => {
  const newProjectId = state.selectedProjectId;
  if (newProjectId && newProjectId !== prevProjectId) {
    const { fetchPlaylists } = usePlaylistsStore.getState();
    usePlaylistsStore.setState({
      activePlaylistId: "quick-notes",
      openPlaylistIds: ["quick-notes"],
      playlistStatus: {},
    });
    fetchPlaylists(newProjectId).catch((e) => {
      console.error(
        "[PlaylistsStore] Failed to fetch playlists for project switch",
        e,
      );
    });
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
