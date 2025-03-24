/**
 * @fileoverview useNoteManagement.ts
 * Custom hook for managing note drafts, statuses, labels, and attachments.
 * Handles saving, clearing, and publishing notes with attachments.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Playlist, NoteStatus, AssetVersion } from "@/types";
import { playlistStore } from "@/store/playlistStore";
import { db, type CachedVersion, type NoteAttachment } from "@/store/db";
import { ftrackService } from "@/services/ftrack";
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
  const [noteAttachments, setNoteAttachments] = useState<
    Record<string, Attachment[]>
  >({});
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Setup hooks
  const toast = useToast();
  const { publishWithNotifications } = useApiWithNotifications();
  const { handleError } = useErrorHandler();

  // Add debouncing for note saving
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSavesRef = useRef<
    Record<
      string,
      {
        content: string;
        labelId: string;
        attachments: Attachment[];
      }
    >
  >({});

  // Load drafts from database
  const loadDrafts = useCallback(async () => {
    try {
      console.debug(`[useNoteManagement] Loading drafts for playlist ${playlist.id}`);

      // Get versions from the current playlist
      const versions = await db.versions
        .where("playlistId")
        .equals(playlist.id)
        .filter(v => !v.isRemoved)
        .toArray();

      // Get attachments for this playlist
      const attachments = await db.attachments
        .where("playlistId")
        .equals(playlist.id)
        .toArray();

      console.debug(`[useNoteManagement] Loaded ${versions.length} versions and ${attachments.length} attachments`);
      
      // Group attachments by version ID
      const attachmentsByVersion = new Map<string, NoteAttachment[]>();
      attachments.forEach(att => {
        if (!attachmentsByVersion.has(att.versionId)) {
          attachmentsByVersion.set(att.versionId, []);
        }
        attachmentsByVersion.get(att.versionId)!.push(att);
      });

      // Prepare maps for state updates
      const draftMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};
      const labelMap: Record<string, string> = {};
      const attachmentMap: Record<string, Attachment[]> = {};

      // Process each version
      for (const version of versions) {
        // Process draft content
        draftMap[version.id] = version.draftContent || "";
        labelMap[version.id] = version.labelId || "";
        
        // Get attachments for this version
        const versionAttachments = attachmentsByVersion.get(version.id) || [];
        
        // Convert to UI attachments
        if (versionAttachments.length > 0) {
          attachmentMap[version.id] = versionAttachments.map(att => {
            // Create a file object if available, otherwise use path
            let file: File | string;
            if (att.filePath) {
              file = att.filePath;
            } else if (att.data instanceof Blob) {
              file = new File([att.data], att.name, { type: att.type });
            } else {
              // Create empty file as fallback
              file = new File([], att.name, { type: att.type });
            }
            
            return {
              id: att.id,
              name: att.name,
              type: att.type,
              previewUrl: att.previewUrl || "",
              file
            };
          });
        }
        
        // Determine the correct status based on content and attachments
        // This is critical to ensure the publish button appears correctly
        if (version.noteStatus === "published") {
          // Always keep published status
          statusMap[version.id] = "published";
        } else if (version.draftContent?.trim() || versionAttachments.length > 0) {
          // If there's content or attachments, it's a draft
          statusMap[version.id] = "draft";
        } else {
          // Otherwise it's empty
          statusMap[version.id] = "empty";
        }
      }
      
      // Log summary of loaded data
      console.debug(
        `[useNoteManagement] Loaded ${Object.keys(draftMap).length} drafts, ` +
        `${Object.keys(attachmentMap).length} versions with attachments, ` +
        `${Object.values(statusMap).filter(s => s === "draft").length} drafts, ` +
        `${Object.values(statusMap).filter(s => s === "published").length} published notes`
      );

      // Update all states at once to avoid race conditions
      setNoteDrafts(draftMap);
      setNoteStatuses(statusMap);
      setNoteLabelIds(labelMap);
      setNoteAttachments(attachmentMap);
      
    } catch (error) {
      console.error("Failed to load drafts:", error);
    }
  }, [playlist.id]);

  // Load drafts when playlist versions change
  useEffect(() => {
    if (!playlist.versions) return;

    console.log(
      `[useNoteManagement] Loading drafts for playlist with ${playlist.versions.length} versions`,
    );
    loadDrafts();
  }, [playlist.versions, loadDrafts]);

  // Ensure we also load when playlist ID changes
  useEffect(() => {
    // Reset selections when switching playlists
    setSelectedVersions([]);
    
    if (playlist.id) {
      console.debug(`[useNoteManagement] Playlist changed to ${playlist.id}, loading drafts`);
      loadDrafts();
    }
  }, [playlist, playlist.id, loadDrafts]);

  // Save a note draft with attachments - with debouncing
  const saveNoteDraft = async (
    versionId: string,
    content: string,
    labelId: string,
    attachments: Attachment[] = [],
  ) => {
    // Store this save operation in our pending saves
    pendingSavesRef.current[versionId] = {
      content,
      labelId,
      attachments,
    };

    // Cancel any existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Update in-memory state immediately for responsive UI
    setNoteDrafts((prev) => ({ ...prev, [versionId]: content }));
    setNoteLabelIds((prev) => ({ ...prev, [versionId]: labelId }));
    setNoteAttachments((prev) => ({
      ...prev,
      [versionId]: attachments,
    }));

    // Determine status for display - consider both content and attachments
    const currentStatus = noteStatuses[versionId];
    const hasAttachments = attachments && attachments.length > 0;
    const newStatus =
      currentStatus === "published"
        ? "published"
        : content.trim() !== "" || hasAttachments
          ? "draft"
          : "empty";

    // Update status immediately for UI responsiveness if needed
    if (currentStatus !== "published" && currentStatus !== newStatus) {
      setNoteStatuses((prev) => ({
        ...prev,
        [versionId]: newStatus,
      }));
    }

    // Unselect if empty (no content and no attachments)
    if (content.trim() === "" && !hasAttachments) {
      setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
    }

    // Schedule actual save after a short delay to avoid race conditions
    saveTimerRef.current = setTimeout(async () => {
      try {
        // Get the latest values that might have been updated during the delay
        const pendingSave = pendingSavesRef.current[versionId];
        if (!pendingSave) return; // Safety check

        const { content, labelId, attachments } = pendingSave;

        // Remove this save from pending operations
        delete pendingSavesRef.current[versionId];

        // Check status again with the latest content and attachments
        const currentStatus = noteStatuses[versionId];
        const hasAttachments = attachments && attachments.length > 0;
        const newStatus =
          currentStatus === "published"
            ? "published"
            : content.trim() !== "" || hasAttachments
              ? "draft"
              : "empty";

        console.debug(
          `[useNoteManagement] Saving note ${versionId} with status: ${newStatus} (previous: ${currentStatus}) and ${attachments.length} attachments`,
        );

        // Save draft content, status, and label to database
        await playlistStore.saveDraft(versionId, playlist.id, content, labelId);

        // Also update the status separately to ensure it's set correctly, passing attachments info
        if (newStatus !== currentStatus) {
          await playlistStore.saveNoteStatus(
            versionId,
            playlist.id,
            newStatus,
            content,
            hasAttachments, // Pass attachment info to saveNoteStatus
          );
        }

        // Save attachments to database
        await playlistStore.saveAttachments(
          versionId,
          playlist.id,
          attachments,
        );
      } catch (error) {
        console.error("Failed to save note:", error);
      }
    }, 100); // Small delay to debounce multiple rapid changes
  };

  // Clear a note draft
  const clearNoteDraft = async (versionId: string) => {
    // Clean up attachment previews
    const attachmentsToClean = noteAttachments[versionId] || [];
    attachmentsToClean.forEach((attachment) => {
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
      const versionsToPublish = selectedVersions.map((id) => ({
        versionId: id,
      }));

      // Call publishWithNotifications with the proper interface
      const publishResults = await publishWithNotifications(async (items) => {
        const successVersions: typeof items = [];
        const failedVersions: typeof items = [];

        // Process each version
        for (const { versionId } of items) {
          try {
            // Skip if already published
            if (noteStatuses[versionId] === "published") {
              console.debug(
                `[useNoteManagement] Skipping already published note ${versionId}`,
              );
              continue;
            }

            const version = playlist.versions?.find((v) => v.id === versionId);
            if (!version) {
              console.error(
                `[useNoteManagement] Version ${versionId} not found`,
              );
              failedVersions.push({ versionId });
              continue;
            }

            const content = noteDrafts[versionId] || "";
            // Skip if content is empty and no attachments
            const attachments = noteAttachments[versionId] || [];
            if (!content.trim() && attachments.length === 0) {
              console.debug(
                `[useNoteManagement] Skipping empty note for version ${versionId}`,
              );
              continue;
            }

            const labelId = noteLabelIds[versionId] || "";

            // Track progress for this particular note
            const handleProgress = (
              attachment: Attachment,
              progress: number,
            ) => {
              // Could use this to update UI with per-attachment progress
              console.debug(
                `[useNoteManagement] Upload progress for ${attachment.name}: ${progress}%`,
              );
            };

            // Use the API-based component upload method with progress tracking
            console.debug(
              `[useNoteManagement] Publishing note for ${versionId} with ${attachments.length} attachments`,
            );
            const noteId = await ftrackService.publishNoteWithAttachmentsAPI(
              versionId,
              content,
              labelId,
              attachments,
            );

            if (noteId) {
              console.debug(
                `[useNoteManagement] Published note ${versionId} with id ${noteId}`,
              );

              // Update the status in the database
              await playlistStore.saveNoteStatus(
                versionId,
                playlist.id,
                "published",
                content,
                attachments.length > 0, // Pass attachment info
              );

              // Update in memory
              setNoteStatuses((prev) => ({
                ...prev,
                [versionId]: "published",
              }));

              successVersions.push({ versionId });
            } else {
              console.error(
                `[useNoteManagement] Failed to publish note ${versionId}`,
              );
              failedVersions.push({ versionId });
            }
          } catch (error) {
            console.error(
              `[useNoteManagement] Error publishing note ${versionId}:`,
              error,
            );
            failedVersions.push({ versionId });
          }
        }

        return {
          success: successVersions,
          failed: failedVersions,
        };
      }, versionsToPublish);

      // Count failures
      if (publishResults.failed.length > 0) {
        console.error(
          `[useNoteManagement] ${publishResults.failed.length} notes failed to publish`,
        );

        // Generic error handling
        const errorMessage =
          "One or more notes could not be published. Please try again.";
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
      const errorMessage =
        errorInfo.message ||
        "An unexpected error occurred while publishing notes";
      handleError(error, errorMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  // Publish all notes
  const publishAllNotes = async () => {
    setIsPublishing(true);
    try {
      // Include versions with either non-empty content or attachments
      const versionsToPublish = Object.entries(noteDrafts)
        .filter(
          ([versionId, content]) =>
            // Include if has content or attachments
            ((content && content.trim() !== "") ||
              (noteAttachments[versionId] &&
                noteAttachments[versionId].length > 0)) &&
            // Don't publish already published notes
            noteStatuses[versionId] !== "published",
        )
        .map(([versionId]) => ({ versionId }));

      console.log(
        `Publishing ${versionsToPublish.length} notes with content or attachments`,
      );

      // Don't proceed if no versions to publish
      if (versionsToPublish.length === 0) {
        toast.showError("No draft notes to publish");
        setIsPublishing(false);
        return;
      }

      // Call publishWithNotifications with the proper interface
      const publishResults = await publishWithNotifications(async (items) => {
        const successVersions: typeof items = [];
        const failedVersions: typeof items = [];

        // Process each version
        for (const { versionId } of items) {
          try {
            // Skip if already published
            if (noteStatuses[versionId] === "published") {
              console.debug(
                `[useNoteManagement] Skipping already published note ${versionId}`,
              );
              continue;
            }

            const version = playlist.versions?.find((v) => v.id === versionId);
            if (!version) {
              console.error(
                `[useNoteManagement] Version ${versionId} not found`,
              );
              failedVersions.push({ versionId });
              continue;
            }

            const content = noteDrafts[versionId] || "";
            // Skip if content is empty and no attachments
            const attachments = noteAttachments[versionId] || [];
            if (!content.trim() && attachments.length === 0) {
              console.debug(
                `[useNoteManagement] Skipping empty note for version ${versionId}`,
              );
              continue;
            }

            const labelId = noteLabelIds[versionId] || "";

            // Track progress for this particular note
            const handleProgress = (
              attachment: Attachment,
              progress: number,
            ) => {
              // Could use this to update UI with per-attachment progress
              console.debug(
                `[useNoteManagement] Upload progress for ${attachment.name}: ${progress}%`,
              );
            };

            // Use the API-based component upload method with progress tracking
            console.debug(
              `[useNoteManagement] Publishing note for ${versionId} with ${attachments.length} attachments`,
            );
            const noteId = await ftrackService.publishNoteWithAttachmentsAPI(
              versionId,
              content,
              labelId,
              attachments,
            );

            if (noteId) {
              console.debug(
                `[useNoteManagement] Published note ${versionId} with id ${noteId}`,
              );

              // Update the status in the database
              await playlistStore.saveNoteStatus(
                versionId,
                playlist.id,
                "published",
                content,
                attachments.length > 0, // Pass attachment info
              );

              // Update in memory
              setNoteStatuses((prev) => ({
                ...prev,
                [versionId]: "published",
              }));

              successVersions.push({ versionId });
            } else {
              console.error(
                `[useNoteManagement] Failed to publish note ${versionId}`,
              );
              failedVersions.push({ versionId });
            }
          } catch (error) {
            console.error(
              `[useNoteManagement] Error publishing note ${versionId}:`,
              error,
            );
            failedVersions.push({ versionId });
          }
        }

        return {
          success: successVersions,
          failed: failedVersions,
        };
      }, versionsToPublish);

      // Count failures
      if (publishResults.failed.length > 0) {
        console.error(
          `[useNoteManagement] ${publishResults.failed.length} notes failed to publish`,
        );

        // Generic error handling
        const errorMessage =
          "One or more notes could not be published. Please try again.";
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
      const errorMessage =
        errorInfo.message ||
        "An unexpected error occurred while publishing notes";
      handleError(error, errorMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  // Clear all notes
  const clearAllNotes = async () => {
    try {
      // Clean up attachment previews
      Object.values(noteAttachments).forEach((attachments) => {
        attachments.forEach((attachment) => {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });
      });

      // Reset all notes to empty in the database
      await Promise.all(
        Object.keys(noteDrafts).map((versionId) =>
          playlistStore.saveDraft(versionId, playlist.id, "", ""),
        ),
      );

      // Also update the status to empty
      await Promise.all(
        Object.keys(noteDrafts).map((versionId) =>
          playlistStore.saveNoteStatus(versionId, playlist.id, "empty", ""),
        ),
      );

      // Clear attachments from database
      await Promise.all(
        Object.keys(noteDrafts).map((versionId) =>
          playlistStore.clearAttachments(versionId, playlist.id),
        ),
      );

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
      const updatePromises = selectedVersions.map((versionId) => {
        // Get existing draft content
        const content = noteDrafts[versionId] || "";

        // Save with new label
        return playlistStore.saveDraft(
          versionId,
          playlist.id,
          content,
          labelId,
        );
      });

      // Wait for all updates to complete
      await Promise.all(updatePromises);

      // Update in memory
      const newLabelIds = { ...noteLabelIds };
      selectedVersions.forEach((versionId) => {
        newLabelIds[versionId] = labelId;
      });

      setNoteLabelIds(newLabelIds);

      toast.showSuccess(
        `Applied label to ${selectedVersions.length} note${selectedVersions.length > 1 ? "s" : ""}`,
      );
    } catch (error) {
      console.error("Failed to set labels for all selected notes:", error);
      toast.showError("Failed to apply labels");
    }
  };

  // Calculate the number of drafts (notes that aren't empty or already published)
  const getDraftCount = useCallback((): number => {
    return Object.entries(noteStatuses).filter(
      ([, status]) => status === "draft",
    ).length;
  }, [noteStatuses]);

  return {
    // State
    selectedVersions,
    noteStatuses,
    noteDrafts,
    noteLabelIds,
    noteAttachments,
    selectedLabel,
    isPublishing,

    // Actions
    saveNoteDraft,
    clearNoteDraft,
    toggleVersionSelection,
    publishSelectedNotes,
    publishAllNotes,
    clearAllNotes,
    setAllLabels,
    setSelectedLabel,
    getDraftCount,
  };
}
