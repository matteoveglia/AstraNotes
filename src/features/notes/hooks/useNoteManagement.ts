/**
 * @fileoverview useNoteManagement.ts
 * Custom hook for managing note drafts, statuses, and labels.
 * Handles saving, clearing, and publishing notes.
 */

import { useState, useEffect, useCallback } from 'react';
import { Playlist, NoteStatus, AssetVersion } from '@/types';
import { playlistStore } from '@/store/playlistStore';
import { db, type CachedVersion } from '@/store/db';
import { ftrackService } from '@/services/ftrack';
import Dexie from 'dexie';

export function useNoteManagement(playlist: Playlist) {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteLabelIds, setNoteLabelIds] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);

  // Load drafts from database
  const loadDrafts = useCallback(async () => {
    try {
      console.debug(`[useNoteManagement] Loading drafts for playlist ${playlist.id}`);
      
      // Explicitly fetch all published notes first to ensure we preserve their status
      const publishedNotes = await db.versions
        .where("[playlistId+id]")
        .between(
          [playlist.id, Dexie.minKey],
          [playlist.id, Dexie.maxKey],
        )
        .filter(v => v.noteStatus === "published")
        .toArray();
        
      console.debug(`[useNoteManagement] Found ${publishedNotes.length} published notes`);

      // Load all drafts for the active playlist
      const allDrafts = await db.versions
        .where("[playlistId+id]")
        .between(
          [playlist.id, Dexie.minKey],
          [playlist.id, Dexie.maxKey],
        )
        .toArray();

      const draftMap: Record<string, string> = {};
      const labelMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};
      
      // First, add all published notes to ensure they have priority
      publishedNotes.forEach((note: CachedVersion) => {
        statusMap[note.id] = "published";
        
        if (note.draftContent) {
          draftMap[note.id] = note.draftContent;
        }
        
        if (note.labelId) {
          labelMap[note.id] = note.labelId;
        }
      });

      // Then process all drafts
      allDrafts.forEach((draft: CachedVersion) => {
        // Only update status if it's not already set to published
        if (!statusMap[draft.id] || statusMap[draft.id] !== "published") {
          statusMap[draft.id] = draft.noteStatus || (draft.draftContent?.trim() === "" ? "empty" : "draft");
        }
        
        if (draft.draftContent) {
          draftMap[draft.id] = draft.draftContent;
        }
        
        if (draft.labelId) {
          labelMap[draft.id] = draft.labelId;
        }
      });

      setNoteDrafts(draftMap);
      setNoteStatuses(statusMap);
      setNoteLabelIds(labelMap);
      
    } catch (error) {
      console.error("Failed to load drafts:", error);
    }
  }, [playlist.id]);

  // Load drafts when playlist versions change
  useEffect(() => {
    if (!playlist.versions) return;
    loadDrafts();
  }, [playlist.versions, loadDrafts]);

  // Reset selections when switching playlists
  useEffect(() => {
    setSelectedVersions([]);
  }, [playlist.id]);

  // Save a note draft
  const saveNoteDraft = async (versionId: string, content: string, labelId: string) => {
    try {
      // Check if the note is already published - if yes, preserve the published status
      const currentStatus = noteStatuses[versionId];
      
      // Only change status if not already published
      const status = currentStatus === "published" 
        ? "published" 
        : (content.trim() === "" ? "empty" : "draft");
      
      console.debug(`[useNoteManagement] Saving note ${versionId} with status: ${status} (previous: ${currentStatus})`);
      
      // Save draft content, status, and label to database
      // Use saveDraft to ensure the label is saved correctly
      await playlistStore.saveDraft(
        versionId,
        playlist.id,
        content,
        labelId
      );
      
      // Also update the status separately to ensure it's set correctly
      if (status !== currentStatus) {
        await playlistStore.saveNoteStatus(
          versionId,
          playlist.id,
          status,
          content
        );
      }

      setNoteDrafts((prev) => ({ ...prev, [versionId]: content }));
      setNoteLabelIds((prev) => ({ ...prev, [versionId]: labelId }));
      
      // Only update status if not published
      if (currentStatus !== "published") {
        setNoteStatuses((prev) => ({
          ...prev,
          [versionId]: status,
        }));
      }

      // Unselect if empty
      if (content.trim() === "") {
        setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  // Clear a note draft
  const clearNoteDraft = async (versionId: string) => {
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
    
    // Reset to empty in the database using saveDraft to ensure labelId is cleared
    await playlistStore.saveDraft(versionId, playlist.id, "", "");
    
    // Also update the status to empty
    await playlistStore.saveNoteStatus(versionId, playlist.id, "empty", "");
  };

  // Toggle version selection
  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((prev) =>
      prev.includes(versionId)
        ? prev.filter((id) => id !== versionId)
        : [...prev, versionId]
    );
  };

  // Publish selected notes
  const publishSelectedNotes = async () => {
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
          playlist.id, 
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

  // Publish all notes
  const publishAllNotes = async () => {
    try {
      setIsPublishing(true);

      // Only get versions from the current playlist if it exists
      const currentVersions = new Set(
        playlist?.versions?.map((v) => v.id) || [],
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
          playlist.id, 
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

  // Clear all notes
  const clearAllNotes = async () => {
    // Get all version IDs that have draft content
    const versionIds = Object.keys(noteDrafts);

    // Clear all drafts from state
    setNoteDrafts({});
    setNoteLabelIds({});
    setSelectedVersions([]);

    // Update note statuses - set all to empty
    const updatedStatuses = {};
    setNoteStatuses(updatedStatuses);

    // Clear drafts from the database
    try {
      await Promise.all(
        versionIds.map(async (versionId) => {
          // First use saveDraft to clear the content and label
          await playlistStore.saveDraft(versionId, playlist.id, "", "");
          
          // Then use saveNoteStatus to properly reset the status to empty
          await playlistStore.saveNoteStatus(versionId, playlist.id, "empty", "");
        }),
      );
    } catch (error) {
      console.error("Failed to clear drafts from database:", error);
    }
  };

  // Set label for all notes
  const setAllLabels = async (labelId: string) => {
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
            playlist.id,
            content,
            labelId
          );
        }),
      );
    } catch (error) {
      console.error("Failed to update labels in database:", error);
    }
  };

  return {
    selectedVersions,
    noteStatuses,
    noteDrafts,
    noteLabelIds,
    isPublishing,
    saveNoteDraft,
    clearNoteDraft,
    toggleVersionSelection,
    publishSelectedNotes,
    publishAllNotes,
    clearAllNotes,
    setAllLabels,
    getDraftCount: () => Object.keys(noteDrafts)
      .filter(id => noteDrafts[id]?.trim() !== "" && noteStatuses[id] !== "published")
      .length
  };
}
