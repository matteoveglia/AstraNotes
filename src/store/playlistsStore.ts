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
import { ftrackService } from "../services/ftrack";
import { db } from "./db";

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
  setPlaylists: (playlists: Playlist[]) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  loadPlaylists: () => Promise<void>;
  updatePlaylist: (playlistId: string) => Promise<void>;
  cleanupLocalPlaylists: () => Promise<void>;
  debugLocalPlaylists: () => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>()((set, get) => ({
  playlists: [QUICK_NOTES_PLAYLIST],
  activePlaylistId: "quick-notes",
  isLoading: false,
  error: null,

  setPlaylists: (playlists) => {
    // Always ensure Quick Notes is in the list
    const hasQuickNotes = playlists.some((p) => p.id === "quick-notes");
    if (hasQuickNotes) {
      // Quick Notes is already in the list, use as-is
      set({ playlists });
    } else {
      // Quick Notes is missing, need to add it
      const { playlists: currentPlaylists } = get();
      const existingQuickNotes = currentPlaylists.find((p) => p.id === "quick-notes");
      
      // Use existing Quick Notes if available, otherwise use default
      const quickNotesToAdd = existingQuickNotes || QUICK_NOTES_PLAYLIST;
      const finalPlaylists = [quickNotesToAdd, ...playlists];
      set({ playlists: finalPlaylists });
    }
  },

  setActivePlaylist: (playlistId) => set({ activePlaylistId: playlistId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadPlaylists: async () => {
    const { setLoading, setError, setPlaylists } = get();
    setLoading(true);
    setError(null);

    try {
      // AGGRESSIVE CLEANUP: Remove all old/broken local playlists FIRST
      try {
        console.log('Starting comprehensive cleanup of local playlists...');
        
        // Get ALL local playlists to inspect them
        const allLocalPlaylists: any[] = []; // Legacy table removed
        console.log('Total local playlists found:', allLocalPlaylists.length);
        
        // Aggressive cleanup conditions - remove playlists that are:
        const playlistsToDelete = allLocalPlaylists.filter(lp => {
          // 1. Marked as synced
          if (lp.syncState === 'synced') return true;
          
          // 2. Marked as not local only
          if (lp.isLocalOnly === false) return true;
          
          // 3. Have an ftrackId (means they were synced)
          if (lp.ftrackId) return true;
          
          // 4. Old playlists without proper local flags (legacy cleanup)
          if (lp.isLocalOnly === undefined && lp.syncState !== 'pending') return true;
          
          // 5. Playlists older than 7 days without being synced (cleanup old abandoned playlists)
          const createdDate = new Date(lp.createdAt);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (createdDate < weekAgo && lp.syncState !== 'pending') return true;
          
          return false;
        });
        
        if (playlistsToDelete.length > 0) {
          console.log('Deleting', playlistsToDelete.length, 'old/broken local playlists:', 
            playlistsToDelete.map(p => ({ id: p.id, name: p.name, syncState: p.syncState, isLocalOnly: p.isLocalOnly, ftrackId: p.ftrackId })));
          
          // Delete the playlists and their associated data
          for (const playlist of playlistsToDelete) {
            await db.transaction('rw', [db.versions], async () => {
              // Legacy tables removed - only clean up versions
              console.log('Legacy playlist cleanup disabled for:', playlist.id);
              
              // Clean up versions that were marked for this local playlist
              await db.versions.where('playlistId').equals(playlist.id).delete();
            });
          }
          
          console.log('Comprehensive cleanup completed - deleted', playlistsToDelete.length, 'playlists');
        } else {
          console.log('No old playlists found to clean up');
        }
      } catch (error) {
        console.error('Failed to clean up old local playlists:', error);
      }

      // Get current count after cleanup
      const remainingLocalPlaylists: any[] = []; // Legacy table removed
      console.log('Remaining local playlists after cleanup:', remainingLocalPlaylists.length);

      // CRITICAL FIX: Load from NEW modular store database (db.playlists)
      // Also fix Issue #4: Load BOTH review sessions AND lists from ftrack
      const [reviewSessions, lists, databasePlaylists] = await Promise.all([
        ftrackService.getPlaylists(), // Review Sessions
        ftrackService.getLists(),    // Lists  
        // Load ALL playlists from the new modular store database
        db.playlists.toArray()
      ]);
      
      const fetchedPlaylists = [...reviewSessions, ...lists];

      console.log('Loaded playlists:', {
        ftrackCount: fetchedPlaylists.length,
        databaseCount: databasePlaylists.length,
        databasePlaylists: databasePlaylists.map((dp: any) => ({ 
          id: dp.id, 
          name: dp.name, 
          localStatus: dp.localStatus, 
          ftrackSyncStatus: dp.ftrackSyncStatus,
          ftrackId: dp.ftrackId 
        }))
      });
      
      // DEBUG: Let's also see what ftrack playlists we're getting
      console.log('Ftrack playlists loaded:', fetchedPlaylists.slice(0, 5).map(fp => ({
        id: fp.id,
        name: fp.name,
        type: fp.type || (fp as any).__entity_type__
      })));

      // Convert database playlists to Playlist format and load their versions
      const databasePlaylistsFormatted: Playlist[] = await Promise.all(
        databasePlaylists.map(async (dbPlaylist: any) => {
          // Load versions for this database playlist
          const versions = await db.versions
            .where('playlistId').equals(dbPlaylist.id)
            .and(v => !v.isRemoved) // Only active versions
            .toArray();

          // Convert database versions to AssetVersion format
          const playlistVersions = versions.map(v => ({
            id: v.id,
            name: v.name,
            version: v.version,
            thumbnailUrl: v.thumbnailUrl || '',
            thumbnailId: v.thumbnailId || '',
            reviewSessionObjectId: v.reviewSessionObjectId || '',
            createdAt: v.addedAt || v.createdAt,
            updatedAt: v.addedAt || v.updatedAt,
            manuallyAdded: v.manuallyAdded || false,
          }));

          console.log(`Loaded ${playlistVersions.length} versions for database playlist ${dbPlaylist.id}`);

          return {
            id: dbPlaylist.id,
            name: dbPlaylist.name,
            title: dbPlaylist.name,
            notes: [],
            versions: playlistVersions,
            createdAt: dbPlaylist.createdAt,
            updatedAt: dbPlaylist.updatedAt,
            // CRITICAL FIX: Include ftrackId from database
            ftrackId: dbPlaylist.ftrackId,
            // CRITICAL FIX: Quick Notes should NEVER be considered local only and should always have isQuickNotes flag
            isLocalOnly: dbPlaylist.id === 'quick-notes' ? false : (dbPlaylist.localStatus === 'draft' || dbPlaylist.ftrackSyncStatus === 'not_synced'),
            isQuickNotes: dbPlaylist.id === 'quick-notes',
            ftrackSyncState: dbPlaylist.ftrackSyncStatus === 'synced' ? 'synced' : 'pending',
            type: dbPlaylist.type,
            categoryId: dbPlaylist.categoryId,
            categoryName: dbPlaylist.categoryName,
          };
        })
      );

      // CRITICAL FIX for Issue #4: Enhanced deduplication to prevent duplicate playlists after sync
      // If a playlist exists both in ftrack and database, prefer the database version (has local modifications)
      const ftrackIds = new Set(fetchedPlaylists.map(p => p.id));
      const databaseIds = new Set(databasePlaylists.map(p => p.ftrackId).filter(Boolean));
      
      console.log('Deduplication data:', {
        ftrackCount: fetchedPlaylists.length,
        databaseCount: databasePlaylists.length,
        ftrackIds: Array.from(ftrackIds),
        databaseFtrackIds: Array.from(databaseIds)
      });
      
      // Enhanced filtering: exclude ftrack playlists that already have database entries
      const uniqueFtrackPlaylists = fetchedPlaylists.filter(fp => {
        const isDuplicateByFtrackId = databaseIds.has(fp.id);
        
        // EXTRA DEBUG: Log every ftrack playlist being checked
        console.log('Deduplication check for ftrack playlist:', {
          ftrackId: fp.id,
          name: fp.name,
          isDuplicateByFtrackId,
          databaseHasFtrackId: databaseIds.has(fp.id),
          databaseFtrackIds: Array.from(databaseIds)
        });
        
        if (isDuplicateByFtrackId) {
          console.log('✅ Excluding duplicate ftrack playlist (already in database):', {
            ftrackId: fp.id,
            name: fp.name
          });
        } else {
          console.log('❌ Adding ftrack playlist (no database entry found):', {
            ftrackId: fp.id,
            name: fp.name
          });
        }
        
        return !isDuplicateByFtrackId;
      });
      
      console.log('After deduplication:', {
        uniqueFtrackPlaylists: uniqueFtrackPlaylists.length,
        databasePlaylists: databasePlaylistsFormatted.length
      });
      
      // CRITICAL FIX: Store ftrack playlists in database so they have proper metadata on reload
      console.log('Storing ftrack playlists in database for persistent metadata...');
      const formattedFtrackPlaylists = [];
      
      for (const ftrackPlaylist of uniqueFtrackPlaylists) {
        try {
          // Check if we already have a database entry for this ftrack playlist
          const existingEntry = await db.playlists.where('ftrackId').equals(ftrackPlaylist.id).first();
          
          let playlistId: string;
          if (existingEntry) {
            // Use existing stable UUID
            playlistId = existingEntry.id;
            console.log(`Using existing database entry for ftrack playlist ${ftrackPlaylist.id}: ${playlistId}`);
          } else {
            // Generate new stable UUID for this ftrack playlist
            playlistId = crypto.randomUUID();
            console.log(`Generated new stable UUID for ftrack playlist ${ftrackPlaylist.id}: ${playlistId}`);
            
            // Create a clean serializable object for database storage
            const playlistEntity = {
              id: playlistId, // STABLE UUID - never changes
              name: String(ftrackPlaylist.name),
              type: (ftrackPlaylist.type || 'reviewsession') as 'reviewsession' | 'list',
              localStatus: 'synced' as const, // Ftrack native playlists are already "synced"
              ftrackSyncStatus: 'synced' as const,
              ftrackId: String(ftrackPlaylist.id), // External reference only
              projectId: ftrackPlaylist.projectId ? String(ftrackPlaylist.projectId) : '', // Ensure string
              categoryId: ftrackPlaylist.categoryId ? String(ftrackPlaylist.categoryId) : undefined,
              categoryName: ftrackPlaylist.categoryName ? String(ftrackPlaylist.categoryName) : undefined,
              description: ftrackPlaylist.description ? String(ftrackPlaylist.description) : undefined,
              createdAt: ftrackPlaylist.createdAt ? String(ftrackPlaylist.createdAt) : new Date().toISOString(),
              updatedAt: ftrackPlaylist.updatedAt ? String(ftrackPlaylist.updatedAt) : new Date().toISOString(),
              syncedAt: new Date().toISOString(), // Mark as synced now
            };
            
            // Store in database with stable UUID
            await db.playlists.put(playlistEntity);
            console.log(`Stored ftrack playlist in database: ${ftrackPlaylist.id} -> ${playlistId} (${ftrackPlaylist.name})`);
          }
          
          // Format for UI with stable UUID as id
          formattedFtrackPlaylists.push({
            ...ftrackPlaylist,
            id: playlistId, // Use stable UUID as playlist ID
            ftrackId: ftrackPlaylist.id, // Set ftrackId for refresh functionality
            isLocalOnly: false, // Ftrack native playlists are not local-only
            ftrackSyncState: 'synced' as const, // Ftrack native playlists are already synced
          });
          
        } catch (error) {
          console.error(`Failed to store ftrack playlist ${ftrackPlaylist.id}:`, error);
          // Still add to UI even if database storage failed
          formattedFtrackPlaylists.push({
            ...ftrackPlaylist,
            ftrackId: ftrackPlaylist.id, // Set ftrackId for refresh functionality
            isLocalOnly: false, // Ftrack native playlists are not local-only
            ftrackSyncState: 'synced' as const, // Ftrack native playlists are already synced
          });
        }
      }
      
      const allPlaylists = [...formattedFtrackPlaylists, ...databasePlaylistsFormatted];
      setPlaylists(allPlaylists); // Quick Notes will be preserved by setPlaylists
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to load playlists",
      );
      console.error("Failed to load playlists:", error);
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
      const fresh = await ftrackService.getPlaylists();
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
    console.log('🧹 Legacy cleanup disabled - use new playlist store instead');
    
    try {
      // Legacy functionality disabled
      const allLocalPlaylists: any[] = []; // Legacy table removed
      console.log('🔍 Total local playlists found:', allLocalPlaylists.length);
      
      if (allLocalPlaylists.length > 0) {
        console.log('📋 All local playlists:', allLocalPlaylists.map(p => ({
          id: p.id,
          name: p.name,
          syncState: p.syncState,
          isLocalOnly: p.isLocalOnly,
          ftrackId: p.ftrackId,
          createdAt: p.createdAt
        })));
      }
      
      // NUCLEAR OPTION: Delete ALL local playlists that are not actively pending
      const playlistsToDelete = allLocalPlaylists.filter(lp => {
        // Keep playlists that are:
        // 1. Explicitly pending and recently created (within last hour as safety)
        // 2. Successfully synced (to preserve history)
        const isRecentlyCreated = new Date(lp.createdAt) > new Date(Date.now() - 60 * 60 * 1000);
        const shouldKeep = (lp.syncState === 'pending' && 
                           (lp.isLocalOnly === true || lp.isLocalOnly === undefined) && 
                           !lp.ftrackId && 
                           isRecentlyCreated) ||
                          (lp.syncState === 'synced' && lp.ftrackId); // Always keep synced playlists
        
        return !shouldKeep; // Delete everything that shouldn't be kept
      });
      
      if (playlistsToDelete.length > 0) {
        console.log('🗑️ NUCLEAR CLEANUP - Deleting', playlistsToDelete.length, 'local playlists:', 
          playlistsToDelete.map(p => ({ id: p.id, name: p.name, syncState: p.syncState, isLocalOnly: p.isLocalOnly, ftrackId: p.ftrackId })));
        
        // Delete the playlists and their associated data
        for (const playlist of playlistsToDelete) {
          await db.transaction('rw', [db.versions], async () => {
            // Legacy cleanup disabled
            console.log('Legacy playlist deletion disabled for:', playlist.id);
            
            // Clean up versions that were marked for this local playlist
            await db.versions.where('playlistId').equals(playlist.id).delete();
          });
        }
        
        console.log('✅ Nuclear cleanup completed - deleted', playlistsToDelete.length, 'playlists');
      } else {
        console.log('✨ No playlists needed to be cleaned up');
      }
      
      // Show final count
      const finalCount = 0; // Legacy table removed
      console.log('📊 Final local playlist count:', finalCount);
      
    } catch (error) {
      console.error('❌ Failed to cleanup local playlists:', error);
    }
  },

  debugLocalPlaylists: async () => {
    console.log('🔍 DEBUG: Legacy debug disabled - use new playlist store instead');
    
    try {
      const allLocalPlaylists: any[] = []; // Legacy table removed
      const allLocalVersions: any[] = []; // Legacy table removed
      const allVersions = await db.versions.toArray();
      
      console.log('📊 Database counts:', {
        localPlaylists: allLocalPlaylists.length,
        localPlaylistVersions: allLocalVersions.length,
        versions: allVersions.length
      });
      
      if (allLocalPlaylists.length > 0) {
        console.log('📋 Local playlists breakdown:', allLocalPlaylists.map(p => ({
          id: p.id,
          name: p.name,
          syncState: p.syncState,
          isLocalOnly: p.isLocalOnly,
          ftrackId: p.ftrackId,
          createdAt: p.createdAt,
          age: Math.round((Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60)) + 'h'
        })));
      }
      
      // Group by state
      const byState = allLocalPlaylists.reduce((acc, p) => {
        const state = p.syncState || 'undefined';
        acc[state] = (acc[state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('📊 Playlists by state:', byState);
      
    } catch (error) {
      console.error('❌ Failed to debug local playlists:', error);
    }
  },
}));

// Make debugging functions available globally
if (typeof window !== 'undefined') {
  (window as any).debugLocalPlaylists = () => usePlaylistsStore.getState().debugLocalPlaylists();
  (window as any).cleanupLocalPlaylists = () => usePlaylistsStore.getState().cleanupLocalPlaylists();
}
