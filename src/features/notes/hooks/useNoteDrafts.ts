/**
 * @fileoverview useNoteDrafts.ts
 * Custom hook for managing note drafts, statuses, and labels.
 * Handles loading, saving, and clearing drafts from IndexedDB.
 */

import { useState, useEffect, useCallback } from 'react';
import { playlistStore } from '@/store/playlistStore';
import { db } from '@/store/db';
import { NoteStatus } from '@/types';
import Dexie from 'dexie';
import type { CachedVersion } from '@/store/db';

export function useNoteDrafts(playlistId: string) {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>({});
  const [noteLabelIds, setNoteLabelIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load drafts from database when playlist changes
  useEffect(() => {
    const loadDrafts = async () => {
      setIsLoading(true);
      
      try {
        console.debug(`[useNoteDrafts] Loading drafts for playlist ${playlistId}`);

        // Load all drafts at once using compound index
        const drafts = await db.versions
          .where("[playlistId+id]")
          .between(
            [playlistId, Dexie.minKey],
            [playlistId, Dexie.maxKey],
          )
          .toArray();
          
        console.debug(`[useNoteDrafts] Loaded ${drafts.length} drafts for playlist ${playlistId}`);

        // Create maps for drafts, statuses, and label IDs
        const draftsMap: Record<string, string> = {};
        const labelIdsMap: Record<string, string> = {};
        const statusMap: Record<string, NoteStatus> = {};

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
      } catch (error) {
        console.error("Failed to load drafts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDrafts();
  }, [playlistId]);

  // Save a draft for a version
  const saveDraft = useCallback(async (
    versionId: string, 
    content: string, 
    labelId?: string
  ) => {
    try {
      const status = content.trim() === "" ? "empty" : "draft";
      
      // Save draft content and status to database
      await playlistStore.saveNoteStatus(
        versionId,
        playlistId,
        status,
        content,
      );

      // Update local state
      setNoteDrafts((prev) => ({ ...prev, [versionId]: content }));
      if (labelId) {
        setNoteLabelIds((prev) => ({ ...prev, [versionId]: labelId }));
      }
      setNoteStatuses((prev) => ({
        ...prev,
        [versionId]: status,
      }));

      return true;
    } catch (error) {
      console.error("Failed to save draft:", error);
      return false;
    }
  }, [playlistId]);

  // Clear a draft for a version
  const clearDraft = useCallback(async (versionId: string) => {
    try {
      // Update local state
      setNoteDrafts((prev) => {
        const newDrafts = { ...prev };
        delete newDrafts[versionId];
        return newDrafts;
      });
      
      setNoteStatuses((prev) => {
        const newStatuses = { ...prev };
        delete newStatuses[versionId];
        return newStatuses;
      });
      
      setNoteLabelIds((prev) => {
        const newLabelIds = { ...prev };
        delete newLabelIds[versionId];
        return newLabelIds;
      });
      
      // Reset to empty in the database
      await playlistStore.saveNoteStatus(versionId, playlistId, "empty", "");
      
      return true;
    } catch (error) {
      console.error("Failed to clear draft:", error);
      return false;
    }
  }, [playlistId]);

  // Clear all drafts
  const clearAllDrafts = useCallback(async () => {
    try {
      // Get all version IDs that have draft content
      const versionIds = Object.keys(noteDrafts);

      // Clear all drafts from state
      setNoteDrafts({});
      setNoteLabelIds({});
      setNoteStatuses({});

      // Clear drafts from the database
      await Promise.all(
        versionIds.map(async (versionId) => {
          await playlistStore.saveDraft(versionId, playlistId, "", "");
        }),
      );
      
      return true;
    } catch (error) {
      console.error("Failed to clear all drafts:", error);
      return false;
    }
  }, [noteDrafts, playlistId]);

  // Set the same label for all drafts
  const setAllLabels = useCallback(async (labelId: string) => {
    try {
      // Update all drafts with the new label
      const updatedLabelIds = { ...noteLabelIds };
      Object.keys(noteDrafts).forEach((versionId) => {
        updatedLabelIds[versionId] = labelId;
      });
      setNoteLabelIds(updatedLabelIds);

      // Save changes to database
      await Promise.all(
        Object.entries(noteDrafts).map(async ([versionId, content]) => {
          await playlistStore.saveDraft(
            versionId,
            playlistId,
            content,
            labelId,
          );
        }),
      );
      
      return true;
    } catch (error) {
      console.error("Failed to update labels:", error);
      return false;
    }
  }, [noteDrafts, noteLabelIds, playlistId]);

  return {
    noteDrafts,
    noteStatuses,
    noteLabelIds,
    isLoading,
    saveDraft,
    clearDraft,
    clearAllDrafts,
    setAllLabels,
  };
}
