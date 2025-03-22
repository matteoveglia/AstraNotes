/**
 * @fileoverview useNoteManagement.ts
 * Custom hook for managing note drafts, statuses, labels, and attachments.
 * Handles saving, clearing, and publishing notes with attachments.
 */

import { useState, useEffect, useCallback } from "react";
import { Playlist, NoteStatus, AssetVersion } from "@/types";
import { playlistStore } from "@/store/playlistStore";
import { db, type CachedVersion } from "@/store/db";
import { ftrackService } from "@/services/ftrack";
import Dexie from "dexie";
import { useToast } from "@/components/ui/toast";
import { useApiWithNotifications } from "@/utils/network";
import { useErrorHandler, categorizeError } from "@/utils/errorHandling";
import { Attachment } from "@/components/NoteAttachments";

export function useNoteManagement(playlist: Playlist) {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>(
    {},
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteLabelIds, setNoteLabelIds] = useState<Record<string, string>>({});
  const [noteAttachments, setNoteAttachments] = useState<Record<string, Attachment[]>>({});
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Setup hooks
  const toast = useToast();
  const { publishWithNotifications } = useApiWithNotifications();
  const { handleError } = useErrorHandler();

  // Load drafts from database
  const loadDrafts = useCallback(async () => {
    try {
      console.debug(
        `[useNoteManagement] Loading drafts for playlist ${playlist.id}`,
      );

      // Explicitly fetch all published notes first to ensure we preserve their status
      const publishedNotes = await db.versions
        .where("[playlistId+id]")
        .between([playlist.id, Dexie.minKey], [playlist.id, Dexie.maxKey])
        .filter((v) => v.noteStatus === "published")
        .toArray();

      console.debug(
        `[useNoteManagement] Found ${publishedNotes.length} published notes`,
      );

      // Load all drafts for the active playlist
      const allDrafts = await db.versions
        .where("[playlistId+id]")
        .between([playlist.id, Dexie.minKey], [playlist.id, Dexie.maxKey])
        .toArray();

      const draftMap: Record<string, string> = {};
      const labelMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};
      const attachmentsMap: Record<string, Attachment[]> = {};

      // First, add all published notes to ensure they have priority
      publishedNotes.forEach((note: CachedVersion) => {
        statusMap[note.id] = "published";

        if (note.draftContent) {
          draftMap[note.id] = note.draftContent;
        }

        if (note.labelId) {
          labelMap[note.id] = note.labelId;
        }
        
        // Add attachments if available
        if (note.attachments && Array.isArray(note.attachments) && note.attachments.length > 0) {
          attachmentsMap[note.id] = note.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            type: att.type,
            previewUrl: att.previewUrl,
            // Create a File object if data is available, otherwise provide empty File
            file: att.data 
              ? new File([att.data], att.name, { type: att.type }) 
              : new File([], att.name, { type: att.type })
          }));
        }
      });

      // Then process all drafts
      allDrafts.forEach((draft: CachedVersion) => {
        // Only update status if it's not already set to published
        if (!statusMap[draft.id] || statusMap[draft.id] !== "published") {
          statusMap[draft.id] =
            draft.noteStatus ||
            (draft.draftContent?.trim() === "" ? "empty" : "draft");
        }

        if (draft.draftContent) {
          draftMap[draft.id] = draft.draftContent;
        }

        if (draft.labelId) {
          labelMap[draft.id] = draft.labelId;
        }
        
        // Add attachments if available
        if (draft.attachments && Array.isArray(draft.attachments) && draft.attachments.length > 0) {
          attachmentsMap[draft.id] = draft.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            type: att.type,
            previewUrl: att.previewUrl,
            // Create a File object if data is available, otherwise provide empty File
            file: att.data 
              ? new File([att.data], att.name, { type: att.type }) 
              : new File([], att.name, { type: att.type })
          }));
        }
      });

      setNoteDrafts(draftMap);
      setNoteStatuses(statusMap);
      setNoteLabelIds(labelMap);
      setNoteAttachments(attachmentsMap);
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

  // Save a note draft with attachments
  const saveNoteDraft = async (
    versionId: string,
    content: string,
    labelId: string,
    attachments: Attachment[] = [],
  ) => {
    try {
      // Check if the note is already published - if yes, preserve the published status
      const currentStatus = noteStatuses[versionId];

      // Only change status if not already published
      const status =
        currentStatus === "published"
          ? "published"
          : content.trim() === ""
            ? "empty"
            : "draft";

      console.debug(
        `[useNoteManagement] Saving note ${versionId} with status: ${status} (previous: ${currentStatus}) and ${attachments.length} attachments`,
      );

      // Save draft content, status, and label to database
      await playlistStore.saveDraft(versionId, playlist.id, content, labelId);

      // Also update the status separately to ensure it's set correctly
      if (status !== currentStatus) {
        await playlistStore.saveNoteStatus(
          versionId,
          playlist.id,
          status,
          content,
        );
      }
      
      // Update attachments in memory
      setNoteAttachments(prev => ({
        ...prev,
        [versionId]: attachments,
      }));
      
      // Save attachments to database
      await playlistStore.saveAttachments(versionId, playlist.id, attachments);

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
    // Clean up attachment previews
    const attachmentsToClean = noteAttachments[versionId] || [];
    attachmentsToClean.forEach(attachment => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    
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
    setNoteAttachments((prev) => {
      const newAttachments = { ...prev };
      delete newAttachments[versionId];
      return newAttachments;
    });

    // Reset to empty in the database using saveDraft to ensure labelId is cleared
    await playlistStore.saveDraft(versionId, playlist.id, "", "");

    // Also update the status to empty
    await playlistStore.saveNoteStatus(versionId, playlist.id, "empty", "");
    
    // Clear attachments from database
    await playlistStore.clearAttachments(versionId, playlist.id);
  };

  // Toggle version selection
  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((prev) =>
      prev.includes(versionId)
        ? prev.filter((id) => id !== versionId)
        : [...prev, versionId],
    );
  };

  // Publish selected notes
  const publishSelectedNotes = async () => {
    if (selectedVersions.length === 0) {
      toast.showError("Select at least one draft note to publish");
      return;
    }

    setIsPublishing(true);
    try {
      // Create an array of version objects to publish
      const versionsToPublish = selectedVersions.map(id => ({ versionId: id }));
      
      // Call publishWithNotifications with the proper interface
      const publishResults = await publishWithNotifications(
        async (items) => {
          const successVersions: typeof items = [];
          const failedVersions: typeof items = [];
          
          // Process each version
          for (const { versionId } of items) {
            try {
              // Skip if already published
              if (noteStatuses[versionId] === "published") {
                console.debug(`[useNoteManagement] Skipping already published note ${versionId}`);
                continue;
              }

              const version = playlist.versions?.find((v) => v.id === versionId);
              if (!version) {
                console.error(`[useNoteManagement] Version ${versionId} not found`);
                failedVersions.push({ versionId });
                continue;
              }

              const content = noteDrafts[versionId] || "";
              const labelId = noteLabelIds[versionId] || "";
              const attachments = noteAttachments[versionId] || [];

              // Use the updated publishNoteWithAttachments method
              const noteId = await ftrackService.publishNoteWithAttachments(
                versionId,
                content,
                labelId,
                attachments
              );

              if (noteId) {
                console.debug(`[useNoteManagement] Published note ${versionId} with id ${noteId}`);
                
                // Update the status in the database
                await playlistStore.saveNoteStatus(
                  versionId,
                  playlist.id,
                  "published",
                  content,
                );

                // Update in memory
                setNoteStatuses((prev) => ({
                  ...prev,
                  [versionId]: "published",
                }));

                successVersions.push({ versionId });
              } else {
                console.error(`[useNoteManagement] Failed to publish note ${versionId}`);
                failedVersions.push({ versionId });
              }
            } catch (error) {
              console.error(`[useNoteManagement] Error publishing note ${versionId}:`, error);
              failedVersions.push({ versionId });
            }
          }

          return { 
            success: successVersions,
            failed: failedVersions
          };
        },
        versionsToPublish
      );

      // Count failures
      if (publishResults.failed.length > 0) {
        console.error(`[useNoteManagement] ${publishResults.failed.length} notes failed to publish`);
        
        // Generic error handling
        const errorMessage = "One or more notes could not be published. Please try again.";
        handleError(new Error("Failed to publish some notes"), errorMessage);
      } else {
        console.debug(`[useNoteManagement] All notes published successfully`);
        
        // Clear selection after successful publish
        setSelectedVersions([]);
      }
    } catch (error) {
      console.error("[useNoteManagement] Error in publish flow:", error);
      
      // Handle the error
      const errorInfo = categorizeError(error);
      const errorMessage = errorInfo.message || "An unexpected error occurred while publishing notes";
      handleError(error, errorMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  // Publish all notes
  const publishAllNotes = async () => {
    setIsPublishing(true);
    try {
      // Create an array of version objects to publish
      const versionsToPublish = Object.keys(noteDrafts).map(id => ({ versionId: id }));
      
      // Call publishWithNotifications with the proper interface
      const publishResults = await publishWithNotifications(
        async (items) => {
          const successVersions: typeof items = [];
          const failedVersions: typeof items = [];
          
          // Process each version
          for (const { versionId } of items) {
            try {
              // Skip if already published
              if (noteStatuses[versionId] === "published") {
                console.debug(`[useNoteManagement] Skipping already published note ${versionId}`);
                continue;
              }

              const version = playlist.versions?.find((v) => v.id === versionId);
              if (!version) {
                console.error(`[useNoteManagement] Version ${versionId} not found`);
                failedVersions.push({ versionId });
                continue;
              }

              const content = noteDrafts[versionId] || "";
              const labelId = noteLabelIds[versionId] || "";
              const attachments = noteAttachments[versionId] || [];

              // Use the updated publishNoteWithAttachments method
              const noteId = await ftrackService.publishNoteWithAttachments(
                versionId,
                content,
                labelId,
                attachments
              );

              if (noteId) {
                console.debug(`[useNoteManagement] Published note ${versionId} with id ${noteId}`);
                
                // Update the status in the database
                await playlistStore.saveNoteStatus(
                  versionId,
                  playlist.id,
                  "published",
                  content,
                );

                // Update in memory
                setNoteStatuses((prev) => ({
                  ...prev,
                  [versionId]: "published",
                }));

                successVersions.push({ versionId });
              } else {
                console.error(`[useNoteManagement] Failed to publish note ${versionId}`);
                failedVersions.push({ versionId });
              }
            } catch (error) {
              console.error(`[useNoteManagement] Error publishing note ${versionId}:`, error);
              failedVersions.push({ versionId });
            }
          }

          return { 
            success: successVersions,
            failed: failedVersions
          };
        },
        versionsToPublish
      );

      // Count failures
      if (publishResults.failed.length > 0) {
        console.error(`[useNoteManagement] ${publishResults.failed.length} notes failed to publish`);
        
        // Generic error handling
        const errorMessage = "One or more notes could not be published. Please try again.";
        handleError(new Error("Failed to publish some notes"), errorMessage);
      } else {
        console.debug(`[useNoteManagement] All notes published successfully`);
        
        // Clear selection after successful publish
        setSelectedVersions([]);
      }
    } catch (error) {
      console.error("[useNoteManagement] Error in publish flow:", error);
      
      // Handle the error
      const errorInfo = categorizeError(error);
      const errorMessage = errorInfo.message || "An unexpected error occurred while publishing notes";
      handleError(error, errorMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  // Clear all notes
  const clearAllNotes = async () => {
    try {
      // Clean up attachment previews
      Object.values(noteAttachments).forEach(attachments => {
        attachments.forEach(attachment => {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });
      });
      
      // Reset all notes to empty in the database
      await Promise.all(Object.keys(noteDrafts).map(versionId => playlistStore.saveDraft(versionId, playlist.id, "", "")));

      // Also update the status to empty
      await Promise.all(Object.keys(noteDrafts).map(versionId => playlistStore.saveNoteStatus(versionId, playlist.id, "empty", "")));

      // Clear attachments from database
      await Promise.all(Object.keys(noteDrafts).map(versionId => playlistStore.clearAttachments(versionId, playlist.id)));

      // Update in memory
      setNoteStatuses({});
      setNoteDrafts({});
      setNoteLabelIds({});
      setNoteAttachments({});
      setSelectedVersions([]);
    } catch (error) {
      console.error("Failed to clear all notes:", error);
    }
  };

  // Set the same label for all selected notes
  const setAllLabels = async (labelId: string) => {
    try {
      // Apply the label to all selected versions
      const updatePromises = selectedVersions.map(versionId => {
        // Get existing draft content
        const content = noteDrafts[versionId] || "";
        
        // Save with new label
        return playlistStore.saveDraft(versionId, playlist.id, content, labelId);
      });
      
      // Wait for all updates to complete
      await Promise.all(updatePromises);
      
      // Update in memory
      const newLabelIds = { ...noteLabelIds };
      selectedVersions.forEach(versionId => {
        newLabelIds[versionId] = labelId;
      });
      
      setNoteLabelIds(newLabelIds);
      
      toast.showSuccess(`Applied label to ${selectedVersions.length} note${selectedVersions.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error("Failed to set labels for all selected notes:", error);
      toast.showError("Failed to apply labels");
    }
  };

  // Getters for hook consumers
  const getNoteStatus = (versionId: string): NoteStatus => {
    return noteStatuses[versionId] || "empty";
  };

  const getNoteDraft = (versionId: string): string => {
    return noteDrafts[versionId] || "";
  };

  const getNoteLabelId = (versionId: string): string => {
    return noteLabelIds[versionId] || "";
  };
  
  const getNoteAttachments = (versionId: string): Attachment[] => {
    return noteAttachments[versionId] || [];
  };

  const isVersionSelected = (versionId: string): boolean => {
    return selectedVersions.includes(versionId);
  };

  // Calculate the number of drafts (notes that aren't empty or already published)
  const getDraftCount = useCallback((): number => {
    return Object.entries(noteStatuses).filter(
      ([, status]) => status === "draft"
    ).length;
  }, [noteStatuses]);

  return {
    // State getters
    getNoteStatus,
    getNoteDraft,
    getNoteLabelId,
    getNoteAttachments,
    isVersionSelected,
    selectedVersions,
    isPublishing,
    noteStatuses,
    noteDrafts,
    noteLabelIds,
    getDraftCount,

    // Actions
    saveNoteDraft,
    clearNoteDraft,
    toggleVersionSelection,
    publishSelectedNotes,
    publishAllNotes,
    clearAllNotes,
    setAllLabels,
    setSelectedLabel,
    selectedLabel,
  };
}
