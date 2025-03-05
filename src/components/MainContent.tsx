/**
 * @fileoverview MainContent.tsx
 * Primary component managing playlist version display and interaction.
 * Handles version selection, note drafts, publishing, and playlist synchronization.
 * Features include note management, batch publishing, real-time updates,
 * version sorting/filtering, and FTrack service integration.
 * @component
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { NoteInput } from "./NoteInput";
import { Playlist, NoteStatus, AssetVersion } from "../types";
import { VersionSearch } from "./VersionSearch";
import { ftrackService } from "../services/ftrack";
import { playlistStore } from "../store/playlistStore";
import { PlaylistModifiedBanner } from "./PlaylistModifiedBanner";
import { RefreshCw } from "lucide-react";
import { useSettings } from "../store/settingsStore";
import { PlaylistMenu } from "./PlaylistMenu";
import { db, type CachedVersion } from "../store/db";
import Dexie from "dexie";
import { fetchThumbnail, clearThumbnailCache } from "../services/thumbnailService";
import { GlowEffect } from '@/components/ui/glow-effect';
import { motion } from 'motion/react';

interface MainContentProps {
  playlist: Playlist;
  onPlaylistUpdate?: (playlist: Playlist) => void;
}

interface NoteInputHandlers {
  onSave: (content: string, labelId: string) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { 
    opacity: 0, 
    scale: 0.9, 
    y: -10,
    transition: { duration: 0.15 } 
  }
};

// Global thumbnail cache that persists across component instances
const globalThumbnailCache: Record<string, string> = {};

export const MainContent: React.FC<MainContentProps> = ({
  playlist,
  onPlaylistUpdate,
}) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>(
    {},
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteLabelIds, setNoteLabelIds] = useState<Record<string, string>>({});
  const [modifications, setModifications] = useState<{
    added: number;
    removed: number;
    addedVersions?: string[];
    removedVersions?: string[];
  }>({ added: 0, removed: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingVersions, setPendingVersions] = useState<AssetVersion[] | null>(
    null,
  );
  const [isInitializing, setIsInitializing] = useState(true);
  const [mergedPlaylist, setMergedPlaylist] = useState<Playlist | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  
  // Ref for tracking active thumbnail loading
  const thumbnailAbortControllerRef = useRef<AbortController | null>(null);
  // Ref for tracking visible versions
  const visibleVersionsRef = useRef<Set<string>>(new Set());
  // Ref for tracking if component is mounted
  const isMountedRef = useRef(true);

  const activePlaylist = mergedPlaylist || playlist;

  const sortedVersions = useMemo(() => {
    if (isInitializing) return [];
    return [...(activePlaylist.versions || [])].sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by version number
      return a.version - b.version;
    });
  }, [activePlaylist.versions, isInitializing]);

  // Initialize playlist in store and start polling
  useEffect(() => {
    const initializePlaylist = async () => {
      setIsInitializing(true);
      console.debug(`[MainContent] Initializing playlist ${playlist.id}`);
      
      try {
        // Stop any existing polling before initializing a new playlist
        playlistStore.stopPolling();
        
        // First initialize in the store
        await playlistStore.initializePlaylist(playlist.id, playlist);

        // Then get the merged version with proper data from IndexedDB
        const cached = await playlistStore.getPlaylist(playlist.id);
        if (cached) {
          setMergedPlaylist({
            ...playlist,
            versions: cached.versions,
          });
        } else {
          setMergedPlaylist(playlist);
        }

        // Reset modifications and pending versions
        setModifications({ added: 0, removed: 0 });
        setPendingVersions(null);
      } catch (error) {
        console.error(`Failed to initialize playlist ${playlist.id}:`, error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializePlaylist();
    
    // Cleanup when unmounting
    return () => {
      console.debug(`[MainContent] Cleaning up for playlist ${playlist.id}`);
      playlistStore.stopPolling();
    };
  }, [playlist.id]);

  const { settings } = useSettings();

  useEffect(() => {
    // Don't poll for Quick Notes playlist
    if (activePlaylist.isQuickNotes) return;

    if (!settings.autoRefreshEnabled) {
      playlistStore.stopPolling();
      return;
    }

    // Start polling when component mounts
    console.debug(`[MainContent] Starting polling for playlist ${activePlaylist.id}`);
    playlistStore.startPolling(
      activePlaylist.id,
      (added, removed, addedVersions, removedVersions, freshVersions) => {
        if (added > 0 || removed > 0) {
          setModifications({
            added,
            removed,
            addedVersions,
            removedVersions,
          });
          // Store the fresh versions but don't apply them yet
          setPendingVersions(freshVersions || null);
        }
      },
    );

    // Stop polling when component unmounts or playlist changes
    return () => {
      console.debug(`[MainContent] Stopping polling for playlist ${activePlaylist.id}`);
      playlistStore.stopPolling();
    };
  }, [
    activePlaylist.id,
    activePlaylist.isQuickNotes,
    settings.autoRefreshEnabled,
  ]);

  // Reset selections when switching playlists
  useEffect(() => {
    setSelectedVersions([]);
  }, [activePlaylist.id]);

  useEffect(() => {
    const loadDrafts = async () => {
      if (!activePlaylist.versions) return;
      
      console.debug(`[MainContent] Loading drafts for playlist ${activePlaylist.id}`);

      const draftsMap: Record<string, string> = {};
      const labelIdsMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};

      // Load all drafts at once using compound index
      const drafts = await db.versions
        .where("[playlistId+id]")
        .between(
          [activePlaylist.id, Dexie.minKey],
          [activePlaylist.id, Dexie.maxKey],
        )
        .toArray();
        
      console.debug(`[MainContent] Loaded ${drafts.length} drafts for playlist ${activePlaylist.id}`);

      // Create maps for drafts and label IDs
      drafts.forEach((draft: CachedVersion) => {
        if (draft.draftContent) {
          draftsMap[draft.id] = draft.draftContent;
          
          // Use stored status if available, otherwise infer from content
          statusMap[draft.id] = draft.noteStatus || 
            (draft.draftContent.trim() === "" ? "empty" : "draft");
        }
        if (draft.labelId) {
          labelIdsMap[draft.id] = draft.labelId;
        }
      });

      setNoteDrafts(draftsMap);
      setNoteLabelIds(labelIdsMap);
      setNoteStatuses(statusMap);
    };

    loadDrafts();
  }, [activePlaylist.id, activePlaylist.versions]);

  // Function to load thumbnails in batches
  const loadThumbnailBatch = async (
    versionsToLoad: AssetVersion[], 
    session: any, 
    abortController: AbortController
  ) => {
    const batchSize = 5; // Number of thumbnails to load at once
    
    for (let i = 0; i < versionsToLoad.length; i += batchSize) {
      // Check if loading should be aborted
      if (abortController.signal.aborted) {
        //console.debug('[MainContent] Thumbnail loading aborted');
        return;
      }
      
      // Get the next batch
      const batch = versionsToLoad.slice(i, i + batchSize);
      console.debug(`[MainContent] Loading thumbnail batch ${i/batchSize + 1}/${Math.ceil(versionsToLoad.length/batchSize)}`);
      
      // Process batch in parallel
      const thumbnailPromises = batch
        .filter(version => version.thumbnailId)
        .map(async (version) => {
          // Skip if already in global cache
          if (globalThumbnailCache[version.id]) {
            return { versionId: version.id, url: globalThumbnailCache[version.id] };
          }
          
          //console.debug('[MainContent] Fetching thumbnail for version:', version.id);
          if (!version.thumbnailId) return null;
          
          try {
            const url = await fetchThumbnail(version.thumbnailId, session, { size: 512 });
            //console.debug('[MainContent] Retrieved thumbnail URL for version:', version.id);
            // Add to global cache
            if (url) {
              globalThumbnailCache[version.id] = url;
              return { versionId: version.id, url };
            }
            return null;
          } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.debug(`Thumbnail fetch aborted for version ${version.id}`);
            } else {
              console.error(`Failed to fetch thumbnail for version ${version.id}:`, error);
            }
            return null;
          }
        });
      
      try {
        const results = await Promise.all(thumbnailPromises);
        
        // Skip updating state if component unmounted or aborted
        if (!isMountedRef.current || abortController.signal.aborted) return;
        
        // Filter out null results and create a map
        const thumbnailMap = results.reduce((acc, result) => {
          if (result && result.url) {
            acc[result.versionId] = result.url;
          }
          return acc;
        }, {} as Record<string, string>);
        
        // Update the state with new thumbnails
        setThumbnails(prev => ({ ...prev, ...thumbnailMap }));
      } catch (error: unknown) {
        console.error("Failed to load thumbnail batch:", error);
      }
      
      // Small delay between batches to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  // Load thumbnails when versions change
  useEffect(() => {
    const loadThumbnails = async () => {
      if (!activePlaylist.versions?.length) return;
      
      // Cancel any ongoing thumbnail loading
      if (thumbnailAbortControllerRef.current) {
        thumbnailAbortControllerRef.current.abort();
      }
      
      // Create new abort controller for this loading session
      const abortController = new AbortController();
      thumbnailAbortControllerRef.current = abortController;
      
      // Check if we already have thumbnails for these versions
      const versionsWithThumbnails = activePlaylist.versions.filter(
        version => version.thumbnailId
      );
      
      // Apply any thumbnails from global cache immediately
      const cachedThumbnails: Record<string, string> = {};
      versionsWithThumbnails.forEach(version => {
        if (globalThumbnailCache[version.id]) {
          cachedThumbnails[version.id] = globalThumbnailCache[version.id];
        }
      });
      
      // Update state with cached thumbnails
      if (Object.keys(cachedThumbnails).length > 0) {
        setThumbnails(prev => ({ ...prev, ...cachedThumbnails }));
      }
      
      // Find versions that need thumbnails loaded
      const versionsToLoad = versionsWithThumbnails.filter(
        version => !globalThumbnailCache[version.id]
      );
      
      if (versionsToLoad.length === 0) {
        console.debug('[MainContent] All thumbnails already in global cache, skipping load');
        return;
      }
      
      console.debug(`[MainContent] Loading thumbnails for ${versionsToLoad.length} versions`);
      
      try {
        const session = await ftrackService.getSession();
        
        // Load thumbnails in batches
        await loadThumbnailBatch(versionsToLoad, session, abortController);
        
        console.debug('[MainContent] Finished loading all thumbnails');
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.debug('Thumbnail loading was aborted');
        } else {
          console.error("Failed to load thumbnails:", error);
        }
      } finally {
        if (thumbnailAbortControllerRef.current === abortController) {
          thumbnailAbortControllerRef.current = null;
        }
      }
    };
    
    loadThumbnails();
  }, [activePlaylist.versions]);

  // Cleanup when component unmounts
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      
      // Cancel any ongoing thumbnail loading
      if (thumbnailAbortControllerRef.current) {
        thumbnailAbortControllerRef.current.abort();
        thumbnailAbortControllerRef.current = null;
      }
    };
  }, []);

  const handleNoteSave = async (
    versionId: string,
    content: string,
    labelId: string,
  ) => {
    try {
      await playlistStore.saveDraft(
        versionId,
        activePlaylist.id,
        content,
        labelId,
      );

      setNoteDrafts((prev) => ({ ...prev, [versionId]: content }));
      setNoteLabelIds((prev) => ({ ...prev, [versionId]: labelId }));
      setNoteStatuses((prev) => ({
        ...prev,
        [versionId]: content.trim() === "" ? "empty" : "draft",
      }));

      // Unselect if empty
      if (content.trim() === "") {
        setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  const handleNoteClear = async (versionId: string) => {
    // Unselect the version when cleared
    setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
    setNoteStatuses((prev) => {
      const newStatuses = { ...prev };
      delete newStatuses[versionId];
      return newStatuses;
    });
    setNoteDrafts((prev) => {
      const newDrafts = { ...prev };
      delete newDrafts[versionId];
      return newDrafts;
    });
    setNoteLabelIds((prev) => {
      const newLabelIds = { ...prev };
      delete newLabelIds[versionId];
      return newLabelIds;
    });
    
    // Reset to empty in the database
    await playlistStore.saveNoteStatus(versionId, activePlaylist.id, "empty", "");
  };

  const handleClearAdded = async () => {
    if (!activePlaylist.id) return;

    try {
      // Clear manually added versions from the database
      await playlistStore.clearAddedVersions(activePlaylist.id);

      // Keep only non-manually added versions in the UI
      const updatedVersions =
        activePlaylist.versions?.filter((v) => !v.manuallyAdded) || [];
      const updatedPlaylist = {
        ...activePlaylist,
        versions: updatedVersions,
        // Also clear the addedVersions array in the local state
        addedVersions: [],
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }
      
      // Update the local state as well to ensure immediate UI update
      setMergedPlaylist(updatedPlaylist);
      
      // Clear any note drafts for the removed versions
      const removedVersionIds = activePlaylist.versions
        ?.filter(v => v.manuallyAdded)
        .map(v => v.id) || [];
        
      if (removedVersionIds.length > 0) {
        setNoteDrafts(prev => {
          const newDrafts = { ...prev };
          removedVersionIds.forEach(id => delete newDrafts[id]);
          return newDrafts;
        });
        
        setNoteStatuses(prev => {
          const newStatuses = { ...prev };
          removedVersionIds.forEach(id => delete newStatuses[id]);
          return newStatuses;
        });
        
        setNoteLabelIds(prev => {
          const newLabelIds = { ...prev };
          removedVersionIds.forEach(id => delete newLabelIds[id]);
          return newLabelIds;
        });
        
        // Also remove from selected versions
        setSelectedVersions(prev => 
          prev.filter(id => !removedVersionIds.includes(id))
        );
      }
    } catch (error) {
      console.error("Failed to clear added versions:", error);
    }
  };

  const handleClearAll = () => {
    if (!activePlaylist.isQuickNotes) return;

    // Clear all versions from the playlist
    const updatedPlaylist = {
      ...activePlaylist,
      versions: [],
    };

    // Update the playlist in the store
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
    }
  };

  const handlePublishSelected = async () => {
    try {
      setIsPublishing(true);
      const publishPromises = selectedVersions
        .filter((versionId) => {
          const content = noteDrafts[versionId];
          const status = noteStatuses[versionId];
          // Only publish non-empty drafts that haven't been published yet
          return content && content.trim() !== "" && status !== "published";
        })
        .map(async (versionId) => {
          try {
            const content = noteDrafts[versionId];
            const labelId = noteLabelIds[versionId];
            await ftrackService.publishNote(versionId, content, labelId);
            setNoteStatuses((prev) => ({ ...prev, [versionId]: "published" }));
            return { success: true, versionId };
          } catch (error) {
            console.error(
              `Failed to publish note for version ${versionId}:`,
              error,
            );
            return { success: false, versionId, error };
          }
        });

      const results = await Promise.all(publishPromises);
      const failures = results.filter((r) => !r.success);

      if (failures.length > 0) {
        console.error("Failed to publish some notes:", failures);
        throw new Error(`Failed to publish ${failures.length} notes`);
      }

      // Only clear drafts for successfully published notes
      const successfulVersions = results
        .filter((r) => r.success)
        .map((r) => r.versionId);
      
      // Keep content but mark as published
      for (const versionId of successfulVersions) {
        await playlistStore.saveNoteStatus(
          versionId, 
          activePlaylist.id, 
          "published", 
          noteDrafts[versionId]
        );
      }
      
      setSelectedVersions([]);
    } catch (error) {
      console.error("Failed to publish selected notes:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishAll = async () => {
    try {
      setIsPublishing(true);

      // Only get versions from the current playlist if it exists
      const currentVersions = new Set(
        activePlaylist?.versions?.map((v) => v.id) || [],
      );

      const publishPromises = Object.entries(noteDrafts)
        .filter(([versionId, content]) => content && content.trim() !== "") // Filter out empty notes
        .filter(([versionId]) => noteStatuses[versionId] !== "published") // Filter out already published notes
        .filter(([versionId]) => currentVersions.has(versionId)) // Only publish notes for versions in current playlist
        .map(async ([versionId, content]) => {
          try {
            const labelId = noteLabelIds[versionId];
            await ftrackService.publishNote(versionId, content, labelId);
            setNoteStatuses((prev) => ({ ...prev, [versionId]: "published" }));
            return { success: true, versionId };
          } catch (error) {
            console.error(
              `Failed to publish note for version ${versionId}:`,
              error,
            );
            return { success: false, versionId, error };
          }
        });

      const results = await Promise.all(publishPromises);
      const failures = results.filter((r) => !r.success);

      if (failures.length > 0) {
        console.error("Failed to publish some notes:", failures);
        throw new Error(`Failed to publish ${failures.length} notes`);
      }

      // Only clear drafts for successfully published notes
      const successfulVersions = results
        .filter((r) => r.success)
        .map((r) => r.versionId);
      
      // Keep content but mark as published
      for (const versionId of successfulVersions) {
        await playlistStore.saveNoteStatus(
          versionId, 
          activePlaylist.id, 
          "published", 
          noteDrafts[versionId]
        );
      }
    } catch (error) {
      console.error("Failed to publish notes:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePlaylistUpdate = async () => {
    // Don't update Quick Notes playlist from Ftrack
    if (activePlaylist.isQuickNotes) return;

    setIsRefreshing(true);
    try {
      // If we have pending versions, use those, otherwise fetch fresh ones
      const freshVersions =
        pendingVersions ||
        (await ftrackService.getPlaylistVersions(activePlaylist.id));

      // Create maps for quick lookup
      const freshVersionsMap = new Map(freshVersions.map((v) => [v.id, v]));
      const currentVersions = activePlaylist.versions || [];
      const manualVersions = currentVersions.filter((v) => v.manuallyAdded);
      const manualVersionIds = new Set(manualVersions.map((v) => v.id));

      // Compare with current versions to find modifications
      // Exclude manually added versions from this check
      const currentVersionIds = new Set(
        currentVersions.filter((v) => !v.manuallyAdded).map((v) => v.id),
      );

      // Only count versions as added if they're not manually added
      const addedVersions = freshVersions
        .filter(
          (v) => !currentVersionIds.has(v.id) && !manualVersionIds.has(v.id),
        )
        .map((v) => v.id);

      // Only count versions as removed if they're not manually added
      const removedVersions = currentVersions
        .filter((v) => !v.manuallyAdded && !freshVersionsMap.has(v.id))
        .map((v) => v.id);

      if (addedVersions.length > 0 || removedVersions.length > 0) {
        setModifications({
          added: addedVersions.length,
          removed: removedVersions.length,
          addedVersions,
          removedVersions,
        });
        // Store the fresh versions but don't apply them yet
        setPendingVersions(freshVersions);
      } else {
        // No changes found, clear any pending versions
        setPendingVersions(null);
        setModifications({ added: 0, removed: 0 });
      }
    } catch (error) {
      console.error("Failed to update playlist:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyPendingChanges = async () => {
    if (!pendingVersions) return;

    try {
      // Get manually added versions from current playlist
      const manualVersions =
        activePlaylist.versions?.filter((v) => v.manuallyAdded) || [];

      // Create a map of pending versions for quick lookup
      const pendingVersionsMap = new Map(pendingVersions.map((v) => [v.id, v]));

      // Merge pending versions with manual versions
      const mergedVersions = [
        ...pendingVersions,
        ...manualVersions.filter((v) => !pendingVersionsMap.has(v.id)),
      ];

      // Create a new playlist object with the merged versions
      const updatedPlaylist = {
        ...activePlaylist,
        versions: mergedVersions,
      };

      // Update the cache first
      await playlistStore.cachePlaylist(
        playlistStore.cleanPlaylistForStorage(updatedPlaylist),
      );

      // Then notify parent components of the update
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Clear pending versions and modifications
      setPendingVersions(null);
      setModifications({ added: 0, removed: 0 });

      // Update playlist and restart polling
      await playlistStore.updatePlaylistAndRestartPolling(
        activePlaylist.id,
        (added, removed, addedVersions, removedVersions, freshVersions) => {
          if (added > 0 || removed > 0) {
            setModifications({
              added,
              removed,
              addedVersions,
              removedVersions,
            });
            setPendingVersions(freshVersions || null);
          }
        },
      );
    } catch (error) {
      console.error("Failed to apply changes:", error);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await handlePlaylistUpdate();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleVersionSelect = async (version: AssetVersion) => {
    try {
      if (!activePlaylist.id) return;

      // Check if the version already exists in the playlist
      const versionExists = activePlaylist.versions?.some(v => v.id === version.id);
      if (versionExists) {
        console.log(`Version ${version.id} already exists in playlist ${activePlaylist.id}, skipping`);
        return;
      }

      // Mark the version as manually added
      const versionWithFlag: AssetVersion = {
        ...version,
        manuallyAdded: true,
      };

      // Add to the database first to ensure it exists
      await playlistStore.addVersionToPlaylist(
        activePlaylist.id,
        versionWithFlag
      );

      // Then update the UI
      const updatedVersions = [
        ...(activePlaylist.versions || []),
        versionWithFlag,
      ];

      const updatedPlaylist = {
        ...activePlaylist,
        versions: updatedVersions,
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Update the local state as well
      setMergedPlaylist(updatedPlaylist);

      // Pre-fetch the thumbnail
      if (version.thumbnailId) {
        ftrackService.getSession().then(session => {
          fetchThumbnail(version.thumbnailId, session).then((url) => {
            if (url) {
              globalThumbnailCache[version.id] = url;
              setThumbnails((prev) => ({
                ...prev,
                [version.id]: url,
              }));
            }
          });
        }).catch(error => {
          console.error("Failed to get ftrack session for thumbnail:", error);
        });
      }
    } catch (error) {
      console.error("Failed to add version to playlist:", error);
    }
  };

  const handleClearAllNotes = async () => {
    // Get all version IDs that have draft content
    const versionIds = Object.keys(noteDrafts);

    // Clear all drafts from state
    setNoteDrafts({});
    setNoteLabelIds({});
    setSelectedVersions([]);

    // Update note statuses
    const updatedStatuses = { ...noteStatuses };
    versionIds.forEach((id) => {
      delete updatedStatuses[id];
    });
    setNoteStatuses(updatedStatuses);

    // Clear drafts from the database
    try {
      await Promise.all(
        versionIds.map(async (versionId) => {
          await playlistStore.saveDraft(versionId, activePlaylist.id, "", "");
        }),
      );
    } catch (error) {
      console.error("Failed to clear drafts from database:", error);
    }
  };

  const handleSetAllLabels = async (labelId: string) => {
    // Update all drafts with the new label
    const updatedLabelIds = { ...noteLabelIds };
    Object.keys(noteDrafts).forEach((versionId) => {
      updatedLabelIds[versionId] = labelId;
    });
    setNoteLabelIds(updatedLabelIds);

    // Save changes to database
    try {
      await Promise.all(
        Object.entries(noteDrafts).map(async ([versionId, content]) => {
          await playlistStore.saveDraft(
            versionId,
            activePlaylist.id,
            content,
            labelId,
          );
        }),
      );
    } catch (error) {
      console.error("Failed to update labels in database:", error);
    }
  };

  const renderModificationsBanner = () => {
    if (modifications.added === 0 && modifications.removed === 0) return null;

    return (
      <PlaylistModifiedBanner
        addedCount={modifications.added}
        removedCount={modifications.removed}
        onUpdate={applyPendingChanges}
        isUpdating={isRefreshing}
        addedVersions={
          pendingVersions?.filter((v) =>
            modifications.addedVersions?.includes(v.id),
          ) || []
        }
        removedVersions={
          activePlaylist.versions?.filter((v) =>
            modifications.removedVersions?.includes(v.id),
          ) || []
        }
      />
    );
  };

  return (
    <Card className="h-full flex flex-col rounded-none">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl">{activePlaylist.name}</CardTitle>
          {!activePlaylist.isQuickNotes && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Refresh Playlist"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {renderModificationsBanner()}
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePublishSelected()}
                disabled={selectedVersions.length === 0 || isPublishing}
              >
                Publish {selectedVersions.length} Selected
              </Button>
              <div className="relative inline-block">
                {Object.keys(noteDrafts).length > 0 && !isPublishing && (
                  <GlowEffect
                    colors={['#FF5733', '#33FF57', '#3357FF', '#F1C40F']}
                    mode='pulse'
                    blur='soft'
                    duration={3}
                    scale={1.1}
                  />
                )}
                <Button
                  size="sm"
                  onClick={() => handlePublishAll()}
                  disabled={Object.keys(noteDrafts).length === 0 || isPublishing}
                  className="relative z-10"
                >
                  Publish All Notes
                </Button>
              </div>
              <div className="ml-3 mx-1 w-px bg-foreground/20 self-stretch" />
              <PlaylistMenu
                onClearAllNotes={handleClearAllNotes}
                onSetAllLabels={handleSetAllLabels}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={gridVariants}
          className="space-y-4 py-4"
        >
          {sortedVersions.map((version) => {
            const thumbnailUrl = thumbnails[version.id];
            const versionHandlers: NoteInputHandlers = {
              onSave: (content: string, labelId: string) =>
                handleNoteSave(version.id, content, labelId),
              onClear: () => handleNoteClear(version.id),
              onSelectToggle: () => {
                setSelectedVersions((prev) =>
                  prev.includes(version.id)
                    ? prev.filter((id) => id !== version.id)
                    : [...prev, version.id],
                );
              },
            };

            return (
              <motion.div
                key={version.id}
                className="space-y-2"
                variants={itemVariants}
                layout
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <NoteInput
                  versionName={version.name}
                  versionNumber={version.version.toString()}
                  thumbnailUrl={thumbnailUrl}
                  status={noteStatuses[version.id] || "empty"}
                  selected={selectedVersions.includes(version.id)}
                  initialContent={noteDrafts[version.id]}
                  initialLabelId={noteLabelIds[version.id]}
                  manuallyAdded={version.manuallyAdded}
                  {...versionHandlers}
                />
              </motion.div>
            );
          })}
          {!activePlaylist.versions?.length && (
            <div className="text-center text-gray-500 py-8">
              {activePlaylist.isQuickNotes
                ? "Search for a version below to begin"
                : "No versions found in this playlist"}
            </div>
          )}
        </motion.div>
      </CardContent>

      <div className="flex-none border-t bg-white shadow-md">
        <div className="p-4">
          <VersionSearch
            onVersionSelect={handleVersionSelect}
            onClearAdded={handleClearAdded}
            hasManuallyAddedVersions={activePlaylist.versions?.some(
              (v) => v.manuallyAdded,
            )}
            isQuickNotes={activePlaylist.isQuickNotes}
          />
        </div>
      </div>
    </Card>
  );
};
