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
        const allLocalPlaylists = await db.localPlaylists.toArray();
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
            await db.transaction('rw', [db.localPlaylists, db.localPlaylistVersions, db.versions], async () => {
              // Delete the playlist
              await db.localPlaylists.delete(playlist.id);
              
              // Delete associated versions relationships
              await db.localPlaylistVersions.where('playlistId').equals(playlist.id).delete();
              
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
      const remainingLocalPlaylists = await db.localPlaylists.toArray();
      console.log('Remaining local playlists after cleanup:', remainingLocalPlaylists.length);

      // Fetch both ftrack playlists and ONLY truly pending local playlists
      const [fetchedPlaylists, localPlaylists] = await Promise.all([
        ftrackService.getPlaylists(),
        // Only get playlists that are definitely pending and local
        db.localPlaylists.filter(lp => 
          lp.syncState === 'pending' && 
          (lp.isLocalOnly === true || lp.isLocalOnly === undefined) && 
          !lp.ftrackId
        ).toArray()
      ]);

      console.log('Loaded playlists:', {
        ftrackCount: fetchedPlaylists.length,
        localCount: localPlaylists.length,
        localPlaylists: localPlaylists.map(lp => ({ id: lp.id, name: lp.name, syncState: lp.syncState, isLocalOnly: lp.isLocalOnly }))
      });

      // Convert local playlists to Playlist format
      const localPlaylistsFormatted: Playlist[] = localPlaylists.map(local => ({
        id: local.id,
        name: local.name,
        title: local.name,
        notes: [],
        versions: [],
        createdAt: local.createdAt,
        updatedAt: local.updatedAt,
        isLocalOnly: true,
        ftrackSyncState: local.syncState as any,
        type: local.type,
        categoryId: local.categoryId,
        categoryName: local.categoryName,
      }));

      // Combine ftrack playlists with pending local playlists
      const allPlaylists = [...fetchedPlaylists, ...localPlaylistsFormatted];
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
    console.log('🧹 Manual cleanup of local playlists triggered...');
    
    try {
      // Get ALL local playlists to inspect them
      const allLocalPlaylists = await db.localPlaylists.toArray();
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
        // Keep only playlists that are:
        // 1. Explicitly pending
        // 2. Local only
        // 3. No ftrack ID
        // 4. Created recently (within last hour as safety)
        const isRecentlyCreated = new Date(lp.createdAt) > new Date(Date.now() - 60 * 60 * 1000);
        const shouldKeep = lp.syncState === 'pending' && 
                          (lp.isLocalOnly === true || lp.isLocalOnly === undefined) && 
                          !lp.ftrackId && 
                          isRecentlyCreated;
        
        return !shouldKeep; // Delete everything that shouldn't be kept
      });
      
      if (playlistsToDelete.length > 0) {
        console.log('🗑️ NUCLEAR CLEANUP - Deleting', playlistsToDelete.length, 'local playlists:', 
          playlistsToDelete.map(p => ({ id: p.id, name: p.name, syncState: p.syncState, isLocalOnly: p.isLocalOnly, ftrackId: p.ftrackId })));
        
        // Delete the playlists and their associated data
        for (const playlist of playlistsToDelete) {
          await db.transaction('rw', [db.localPlaylists, db.localPlaylistVersions, db.versions], async () => {
            // Delete the playlist
            await db.localPlaylists.delete(playlist.id);
            
            // Delete associated versions relationships
            await db.localPlaylistVersions.where('playlistId').equals(playlist.id).delete();
            
            // Clean up versions that were marked for this local playlist
            await db.versions.where('playlistId').equals(playlist.id).delete();
          });
        }
        
        console.log('✅ Nuclear cleanup completed - deleted', playlistsToDelete.length, 'playlists');
      } else {
        console.log('✨ No playlists needed to be cleaned up');
      }
      
      // Show final count
      const finalCount = await db.localPlaylists.count();
      console.log('📊 Final local playlist count:', finalCount);
      
    } catch (error) {
      console.error('❌ Failed to cleanup local playlists:', error);
    }
  },

  debugLocalPlaylists: async () => {
    console.log('🔍 DEBUG: Inspecting local playlists...');
    
    try {
      const allLocalPlaylists = await db.localPlaylists.toArray();
      const allLocalVersions = await db.localPlaylistVersions.toArray();
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
