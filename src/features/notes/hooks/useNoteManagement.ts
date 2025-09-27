/**
 * @fileoverview useNoteManagement.ts
 * Custom hook for managing note drafts, statuses, labels, and attachments.
 * Handles saving, clearing, and publishing notes with attachments.
 * Uses React Concurrent Mode features for responsive UI during heavy operations.
 */

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { Playlist, NoteStatus } from "@/types";
import { playlistStore } from "@/store/playlist";
import { db, type NoteAttachment } from "@/store/db";
import { noteClient } from "@/services/client";
import { useToast } from "@/components/ui/toast";
import { useApiWithNotifications } from "@/utils/network";
import { useErrorHandler, categorizeError } from "@/utils/errorHandling";
import { Attachment } from "@/components/NoteAttachments";
import { emitOnboardingEvent } from "@/onboarding/events";

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
  const [_selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastPublishTime, setLastPublishTime] = useState<Date | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [publishedVersionsCount, setPublishedVersionsCount] =
    useState<number>(0);
  const [publishingErrors, setPublishingErrors] = useState<string[]>([]);

  // Progress modal state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [versionsToPublish, setVersionsToPublish] = useState<string[]>([]);

  // Add useTransition for non-urgent state updates
  const [isPending, startTransition] = useTransition();

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

  // Add a ref to track the current playlist ID to prevent race conditions
  const currentPlaylistIdRef = useRef<string | null>(null);

  // Add tracking of created object URLs to prevent memory leaks
  const createdURLs = useRef<Set<string>>(new Set());

  // State to track user interaction for more aggressive debouncing
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const interactionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Set up user interaction tracking
  useEffect(() => {
    const startInteraction = () => setIsUserInteracting(true);
    const endInteraction = () => {
      // Clear any existing timer
      if (interactionTimerRef.current) {
        clearTimeout(interactionTimerRef.current);
      }

      // Use debounce to detect end of interaction
      interactionTimerRef.current = setTimeout(() => {
        setIsUserInteracting(false);

        // When user stops interacting, apply any pending saves immediately
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;

          // Process all pending saves
          Object.keys(pendingSavesRef.current).forEach((versionId) => {
            const { content, labelId, attachments } =
              pendingSavesRef.current[versionId];
            processSaveDraft(versionId, content, labelId, attachments);
          });
        }
      }, 500);
    };

    document.addEventListener("keydown", startInteraction);
    document.addEventListener("keyup", endInteraction);

    return () => {
      document.removeEventListener("keydown", startInteraction);
      document.removeEventListener("keyup", endInteraction);

      if (interactionTimerRef.current) {
        clearTimeout(interactionTimerRef.current);
      }
    };
  }, []);

  // Add cleanup on component unmount
  useEffect(() => {
    return () => {
      // Cleanup all object URLs when component unmounts
      createdURLs.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      createdURLs.current.clear();
    };
  }, []);

  // Helper function to process the actual save operation
  const processSaveDraft = async (
    versionId: string,
    content: string,
    labelId: string,
    attachments: Attachment[] = [],
  ) => {
    const MAX_RETRIES = 2;
    let retryCount = 0;
    let success = false;

    while (retryCount <= MAX_RETRIES && !success) {
      try {
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
          `[useNoteManagement] Saving note ${versionId} with status: ${newStatus} (previous: ${currentStatus}) and ${attachments.length} attachments${retryCount > 0 ? ` (retry ${retryCount})` : ""}`,
        );

        // Save draft content, status, and label to database
        await playlistStore.saveDraft(playlist.id, versionId, content, labelId);

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

        // Save attachments to database - this is where most errors happen
        await playlistStore.saveAttachments(
          versionId,
          playlist.id,
          attachments,
        );

        // If we get here, the save was successful
        success = true;
      } catch (error) {
        retryCount++;
        console.error(
          `[useNoteManagement] Failed to save note (attempt ${retryCount}/${MAX_RETRIES}):`,
          error,
        );

        // Wait before retrying
        if (retryCount <= MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        // If we're out of retries, try a fallback approach
        if (retryCount > MAX_RETRIES) {
          console.error(
            `[useNoteManagement] All retry attempts failed for version ${versionId}, trying fallback...`,
          );

          try {
            // Try to save just the content without attachments as a last resort
            await playlistStore.saveDraft(
              playlist.id,
              versionId,
              content,
              labelId,
            );

            // Update status (without attachments this time)
            const fallbackStatus = content.trim() !== "" ? "draft" : "empty";
            await playlistStore.saveNoteStatus(
              versionId,
              playlist.id,
              fallbackStatus,
              content,
              false, // No attachments
            );

            // Remove problematic attachments and update UI accordingly
            recoverFromAttachmentError(versionId);

            // Log the recovery
            console.debug(
              `[useNoteManagement] Successfully recovered note content for ${versionId} without attachments`,
            );
            success = true;
          } catch (fallbackError) {
            console.error(
              `[useNoteManagement] Fallback save also failed for ${versionId}:`,
              fallbackError,
            );
          }
        }
      }
    }
  };

  // Save a note draft with attachments - with adaptive debouncing based on user interaction
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

    // Use a longer delay during user interaction (typing) for better performance
    const debounceDelay = isUserInteracting ? 350 : 150;

    // Add initial 15ms delay for first save
    const initialDelay = isUserInteracting ? 30 : 0;

    // Schedule actual save after a short delay to avoid race conditions and allow batching
    saveTimerRef.current = setTimeout(() => {
      processSaveDraft(versionId, content, labelId, attachments);
    }, initialDelay + debounceDelay);
  };

  // Load drafts from database
  const loadDrafts = useCallback(async () => {
    try {
      // Skip if playlist ID has changed since function was called
      if (currentPlaylistIdRef.current !== playlist.id) {
        console.debug(
          `[useNoteManagement] Playlist ID changed during load, aborting`,
        );
        return;
      }

      console.debug(
        `[useNoteManagement] Loading drafts for playlist ${playlist.id}`,
      );

      // Fetch raw versions and attachments in parallel for better performance
      const [dbVersions, attachments] = await Promise.all([
        db.versions.where("playlistId").equals(playlist.id).toArray(),
        db.attachments.where("playlistId").equals(playlist.id).toArray(),
      ]);

      // For playlists deleted in ftrack, we're in an in-session snapshot mode.
      // We must include versions even if they are marked isRemoved in DB,
      // but limit them to those currently shown in the UI snapshot (playlist.versions).
      const versions = playlist.deletedInFtrack
        ? dbVersions.filter((v) =>
            (playlist.versions || []).some((av) => av.id === v.id),
          )
        : dbVersions.filter((v) => !v.isRemoved);

      console.debug(
        `[useNoteManagement] Loaded ${versions.length} versions and ${attachments.length} attachments` +
          (playlist.deletedInFtrack
            ? " (deleted-in-ftrack snapshot mode)"
            : ""),
      );

      // Skip if playlist ID has changed during DB queries
      if (currentPlaylistIdRef.current !== playlist.id) {
        console.debug(
          `[useNoteManagement] Playlist ID changed during load, aborting`,
        );
        return;
      }

      // Process in a more memory-efficient way by building maps first
      const draftMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};
      const labelMap: Record<string, string> = {};
      const attachmentMap: Record<string, Attachment[]> = {};

      // Group attachments by version ID for faster lookup
      const attachmentsByVersion = new Map<string, NoteAttachment[]>();
      attachments.forEach((att) => {
        if (!attachmentsByVersion.has(att.versionId)) {
          attachmentsByVersion.set(att.versionId, []);
        }
        attachmentsByVersion.get(att.versionId)!.push(att);
      });

      // Process each version and its attachments
      versions.forEach((version) => {
        // Process basic version data
        draftMap[version.id] = version.draftContent || "";
        labelMap[version.id] = version.labelId || "";

        // Process attachments for this version
        const versionAttachments = attachmentsByVersion.get(version.id) || [];
        if (versionAttachments.length > 0) {
          attachmentMap[version.id] = versionAttachments.map((att) => {
            // Create appropriate file reference
            let file: File | string;
            if (att.filePath) {
              file = att.filePath; // For Tauri file paths
            } else if (att.data instanceof Blob) {
              try {
                file = new File([att.data], att.name, { type: att.type });
              } catch (error) {
                console.warn(
                  `Failed to create File from stored data for ${att.name}:`,
                  error,
                );
                file = new File([], att.name, { type: att.type }); // Fallback empty file
              }
            } else {
              // Create a placeholder file if no data is available
              file = new File([], att.name, { type: att.type });
            }

            return {
              id: att.id,
              name: att.name,
              type: att.type,
              previewUrl: att.previewUrl || "",
              file,
            };
          });
        }

        // Determine the correct status based on content and attachments
        if (version.noteStatus === "published") {
          // Always keep published status
          statusMap[version.id] = "published";
        } else if (
          version.draftContent?.trim() ||
          versionAttachments.length > 0
        ) {
          // If there's content or attachments, it's a draft
          statusMap[version.id] = "draft";
        } else {
          // Otherwise it's empty
          statusMap[version.id] = "empty";
        }
      });

      // Log summary of loaded data
      console.debug(
        `[useNoteManagement] Loaded ${Object.keys(draftMap).length} drafts, ` +
          `${Object.keys(attachmentMap).length} versions with attachments, ` +
          `${Object.values(statusMap).filter((s) => s === "draft").length} drafts, ` +
          `${Object.values(statusMap).filter((s) => s === "published").length} published notes`,
      );

      // Skip if playlist ID has changed during processing
      if (currentPlaylistIdRef.current !== playlist.id) {
        console.debug(
          `[useNoteManagement] Playlist ID changed during processing, aborting`,
        );
        return;
      }

      // Update all states at once to reduce renders
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
    currentPlaylistIdRef.current = playlist.id;
    loadDrafts();
  }, [playlist.versions, loadDrafts]);

  // Ensure we also load when playlist ID changes
  useEffect(() => {
    // Reset selections when switching playlists
    setSelectedVersions([]);

    if (playlist.id) {
      console.log(
        `[useNoteManagement] Playlist changed to ${playlist.id}, loading data...`,
      );

      // Update ref immediately to track current playlist ID
      currentPlaylistIdRef.current = playlist.id;

      // Reset states to avoid displaying stale data during loading
      setNoteDrafts({});
      setNoteStatuses({});
      setNoteLabelIds({});
      setNoteAttachments({});

      // Load data after clearing states
      loadDrafts();
    }
  }, [playlist.id, loadDrafts]);

  // Add a recovery function for attachment errors
  const recoverFromAttachmentError = (versionId: string) => {
    console.log(
      `[useNoteManagement] Recovering from attachment error for version ${versionId}`,
    );

    // Remove problematic attachments from state
    setNoteAttachments((prev) => {
      const updated = { ...prev };
      delete updated[versionId];
      return updated;
    });

    // Update status appropriately based on content
    const content = noteDrafts[versionId];
    const newStatus = content && content.trim() !== "" ? "draft" : "empty";

    setNoteStatuses((prev) => ({
      ...prev,
      [versionId]: newStatus,
    }));
  };

  // Clear a note draft
  const clearNoteDraft = async (versionId: string) => {
    // Clean up attachment previews
    const attachmentsToClean = noteAttachments[versionId] || [];
    attachmentsToClean.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
        createdURLs.current.delete(attachment.previewUrl);
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

    // CRITICAL FIX: Correct parameter order for saveDraft (playlistId, versionId, content, labelId)
    await playlistStore.saveDraft(playlist.id, versionId, "", "");

    // CRITICAL FIX: Correct parameter order for saveNoteStatus (versionId, playlistId, status, content)
    await playlistStore.saveNoteStatus(versionId, playlist.id, "empty", "");

    // CRITICAL FIX: Correct parameter order for clearAttachments (versionId, playlistId)
    await playlistStore.clearAttachments(versionId, playlist.id);
  };

  // Toggle version selection with startTransition for responsive UI
  const toggleVersionSelection = (versionId: string) => {
    // Update UI immediately for instant feedback
    const isCurrentlySelected = selectedVersions.includes(versionId);

    startTransition(() => {
      // Non-urgent: Update the selection state
      setSelectedVersions((prev) =>
        prev.includes(versionId)
          ? prev.filter((id) => id !== versionId)
          : [...prev, versionId],
      );
    });
  };

  const clearAllSelections = () => {
    startTransition(() => {
      // Non-urgent: Clear all selections
      setSelectedVersions([]);
    });
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
            // Skip if already published - count as success since it's already done
            if (noteStatuses[versionId] === "published") {
              console.debug(
                `[useNoteManagement] Skipping already published note ${versionId}`,
              );
              successVersions.push({ versionId }); // Count as success
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
            // Skip if content is empty and no attachments - count as success since nothing to publish
            const attachments = noteAttachments[versionId] || [];
            if (!content.trim() && attachments.length === 0) {
              console.debug(
                `[useNoteManagement] Skipping empty note for version ${versionId}`,
              );
              successVersions.push({ versionId }); // Count as success
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

            const noteId = await noteClient().publishNoteWithAttachmentsAPI(
              versionId,
              content,
              attachments,
              labelId,
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
                labelId, // Pass the actual label ID
              );

              // Update in memory with startTransition for responsiveness
              startTransition(() => {
                setNoteStatuses((prev) => ({
                  ...prev,
                  [versionId]: "published",
                }));
              });

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

        // Clear selection after successful publish with startTransition
        startTransition(() => {
          setSelectedVersions([]);
        });
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

      console.debug(
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
            // Skip if already published - count as success since it's already done
            if (noteStatuses[versionId] === "published") {
              console.debug(
                `[useNoteManagement] Skipping already published note ${versionId}`,
              );
              successVersions.push({ versionId }); // Count as success
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
            // Skip if content is empty and no attachments - count as success since nothing to publish
            const attachments = noteAttachments[versionId] || [];
            if (!content.trim() && attachments.length === 0) {
              console.debug(
                `[useNoteManagement] Skipping empty note for version ${versionId}`,
              );
              successVersions.push({ versionId }); // Count as success
              continue;
            }

            const labelId = noteLabelIds[versionId] || undefined;

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
              `[useNoteManagement] Publishing ALL notes - version ${versionId} with ${attachments.length} attachments and labelId: "${labelId}"`,
            );

            const noteId = await noteClient().publishNoteWithAttachmentsAPI(
              versionId,
              content,
              attachments,
              labelId,
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
                labelId, // Pass the actual label ID
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

  // Sequential publishing function for progress modal
  const publishNotesSequentially = async (
    versionIds: string[],
    onProgress: (
      current: number,
      total: number,
      versionId: string,
      step: string,
    ) => void,
  ): Promise<{ success: string[]; failed: string[] }> => {
    const success: string[] = [];
    const failed: string[] = [];
    const total = versionIds.length;

    // Sort version IDs based on their order in the playlist
    const orderedVersionIds = versionIds.sort((a, b) => {
      const indexA = playlist.versions?.findIndex((v) => v.id === a) ?? -1;
      const indexB = playlist.versions?.findIndex((v) => v.id === b) ?? -1;
      return indexA - indexB;
    });

    for (let i = 0; i < orderedVersionIds.length; i++) {
      const versionId = orderedVersionIds[i];
      const version = playlist.versions?.find((v) => v.id === versionId);
      const versionDisplay = version
        ? `${version.name} v${version.version}`
        : versionId;

      try {
        // Skip if already published
        if (noteStatuses[versionId] === "published") {
          console.debug(
            `[useNoteManagement] Skipping already published note ${versionId}`,
          );
          success.push(versionId);
          onProgress(i + 1, total, versionDisplay, "Already published");
          continue;
        }

        if (!version) {
          console.error(`[useNoteManagement] Version ${versionId} not found`);
          failed.push(versionId);
          onProgress(i + 1, total, versionDisplay, "Version not found");
          continue;
        }

        const content = noteDrafts[versionId] || "";
        const attachments = noteAttachments[versionId] || [];

        // Skip if content is empty and no attachments
        if (!content.trim() && attachments.length === 0) {
          console.debug(
            `[useNoteManagement] Skipping empty note for version ${versionId}`,
          );
          success.push(versionId);
          onProgress(i + 1, total, versionDisplay, "Skipped (empty)");
          continue;
        }

        const labelId = noteLabelIds[versionId] || undefined;

        // Update progress to show we're publishing this note
        onProgress(i, total, versionDisplay, "Publishing note...");

        console.debug(
          `[useNoteManagement] Publishing note for ${versionId} (${versionDisplay}) with ${attachments.length} attachments`,
        );

        const noteId = await noteClient().publishNoteWithAttachmentsAPI(
          versionId,
          content,
          attachments,
          labelId,
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
            labelId,
          );

          // Update in memory
          setNoteStatuses((prev) => ({
            ...prev,
            [versionId]: "published",
          }));

          success.push(versionId);
          onProgress(i + 1, total, versionDisplay, "Published successfully");
        } else {
          console.error(
            `[useNoteManagement] Failed to publish note ${versionId}`,
          );
          failed.push(versionId);
          onProgress(i + 1, total, versionDisplay, "Failed to publish");
        }
      } catch (error) {
        console.error(
          `[useNoteManagement] Error publishing note ${versionId}:`,
          error,
        );
        failed.push(versionId);
        onProgress(i + 1, total, versionDisplay, "Error occurred");
      }
    }

    return { success, failed };
  };

  // Updated publish selected notes to use modal
  const publishSelectedNotesWithModal = async () => {
    if (selectedVersions.length === 0) {
      toast.showError("Select at least one draft note to publish");
      return;
    }

    // Filter out already published and empty notes
    const filteredVersions = selectedVersions.filter((versionId) => {
      const status = noteStatuses[versionId];
      const content = noteDrafts[versionId] || "";
      const attachments = noteAttachments[versionId] || [];

      return (
        status !== "published" &&
        (content.trim() !== "" || attachments.length > 0)
      );
    });

    if (filteredVersions.length === 0) {
      toast.showError("No publishable notes selected");
      return;
    }

    setVersionsToPublish(filteredVersions);
    setShowPublishModal(true);
  };

  // Updated publish all notes to use modal
  const publishAllNotesWithModal = async () => {
    // Filter notes that have content or attachments and are not already published
    const versionsToPublish = Object.entries(noteDrafts)
      .filter(([versionId, content]) => {
        const attachments = noteAttachments[versionId] || [];
        return (
          ((content && content.trim() !== "") || attachments.length > 0) &&
          noteStatuses[versionId] !== "published"
        );
      })
      .map(([versionId]) => versionId);

    if (versionsToPublish.length === 0) {
      toast.showError("No draft notes to publish");
      return;
    }

    setVersionsToPublish(versionsToPublish);
    setShowPublishModal(true);
  };

  // Close modal and cleanup
  const closePublishModal = () => {
    setShowPublishModal(false);
    setVersionsToPublish([]);

    // Clear selection after successful publish (if there were no failures)
    setSelectedVersions([]);
  };

  // Clear all notes
  const clearAllNotes = async () => {
    try {
      // Get all version IDs that need to be cleared
      const versionIds = Object.keys(noteDrafts);

      // First, clear selection
      setSelectedVersions([]);

      // Force a re-render by creating completely new objects with explicit values
      const emptyStatuses: Record<string, NoteStatus> = {};
      const emptyDrafts: Record<string, string> = {};
      const emptyLabelIds: Record<string, string> = {};
      const emptyAttachments: Record<string, Attachment[]> = {};

      versionIds.forEach((versionId) => {
        emptyStatuses[versionId] = "empty";
        emptyDrafts[versionId] = "";
        emptyLabelIds[versionId] = "";
        emptyAttachments[versionId] = [];
      });

      // Force UI update with a more aggressive approach - apply updates in sequence
      // First set the status to empty to trigger the status effect in NoteInput
      setNoteStatuses({ ...emptyStatuses });

      // Then apply the other changes with minimal delay to allow React to process
      await new Promise((resolve) => setTimeout(resolve, 10));
      setNoteDrafts({ ...emptyDrafts });

      await new Promise((resolve) => setTimeout(resolve, 10));
      setNoteLabelIds({ ...emptyLabelIds });

      await new Promise((resolve) => setTimeout(resolve, 10));
      setNoteAttachments({ ...emptyAttachments });

      // Clean up attachment previews after state update
      setTimeout(() => {
        Object.values(noteAttachments).forEach((attachments) => {
          attachments.forEach((attachment) => {
            if (attachment.previewUrl) {
              URL.revokeObjectURL(attachment.previewUrl);
              createdURLs.current.delete(attachment.previewUrl);
            }
          });
        });
      }, 0);

      // Force React to flush state changes before DB operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Add a direct DOM manipulation to force redraw
      // This is a last resort approach that can help with stubborn rendering issues
      document.querySelectorAll(".w-full.mt-3").forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.display = "none";
          // Force a reflow
          void el.offsetHeight;
          // Then restore display
          setTimeout(() => {
            el.style.display = "";
          }, 0);
        }
      });

      // Process database updates in batches
      const batchSize = 5;
      for (let i = 0; i < versionIds.length; i += batchSize) {
        const batch = versionIds.slice(
          i,
          Math.min(i + batchSize, versionIds.length),
        );

        // Clear attachments first
        await Promise.all(
          batch.map((versionId) =>
            playlistStore.clearAttachments(versionId, playlist.id),
          ),
        );

        // Then clear draft content
        await Promise.all(
          batch.map((versionId) =>
            playlistStore.saveDraft(versionId, playlist.id, "", ""),
          ),
        );

        // Finally update status
        await Promise.all(
          batch.map((versionId) =>
            playlistStore.saveNoteStatus(versionId, playlist.id, "empty", ""),
          ),
        );
      }

      console.debug(
        `[useNoteManagement] Successfully cleared all notes for playlist ${playlist.id}`,
      );

      // Dispatch a custom event to force NoteInput components to check their state
      window.dispatchEvent(
        new CustomEvent("astranotes:clear-all-notes-completed"),
      );
    } catch (error) {
      console.error("Failed to clear all notes:", error);

      // Ensure UI is cleared even if DB operations fail
      // Create fallback empty objects with explicit values
      const fallbackEmptyStatuses: Record<string, NoteStatus> = {};
      const fallbackEmptyDrafts: Record<string, string> = {};
      const fallbackEmptyLabelIds: Record<string, string> = {};
      const fallbackEmptyAttachments: Record<string, Attachment[]> = {};

      Object.keys(noteDrafts).forEach((versionId) => {
        fallbackEmptyStatuses[versionId] = "empty";
        fallbackEmptyDrafts[versionId] = "";
        fallbackEmptyLabelIds[versionId] = "";
        fallbackEmptyAttachments[versionId] = [];
      });

      // Apply fallback updates in sequence as well
      setSelectedVersions([]);
      setNoteStatuses({ ...fallbackEmptyStatuses });

      setTimeout(() => {
        setNoteDrafts({ ...fallbackEmptyDrafts });
        setTimeout(() => {
          setNoteLabelIds({ ...fallbackEmptyLabelIds });
          setTimeout(() => {
            setNoteAttachments({ ...fallbackEmptyAttachments });

            // Dispatch the custom event here too
            window.dispatchEvent(
              new CustomEvent("astranotes:clear-all-notes-completed"),
            );
          }, 10);
        }, 10);
      }, 10);
    }
  };

  // Set the same label for selected notes if any are selected, otherwise for all draft notes
  const setAllLabels = async (labelId: string) => {
    try {
      // First determine if we should use selected versions or all drafts
      const selectedDraftVersionIds = selectedVersions.filter(
        (versionId) => noteStatuses[versionId] === "draft",
      );

      // If there are selected drafts, apply to those only
      // Otherwise, apply to all drafts
      const candidateVersionIds =
        selectedDraftVersionIds.length > 0
          ? selectedDraftVersionIds
          : Object.entries(noteStatuses)
              .filter(([, status]) => status === "draft")
              .map(([versionId]) => versionId);

      if (candidateVersionIds.length === 0) {
        toast.showError("No draft notes to apply label to");
        return;
      }

      // Filter to only include versions that actually exist in the current playlist
      // This prevents errors when trying to update versions that don't exist in the repository
      const playlistVersionIds = new Set(
        playlist.versions?.map((v) => v.id) || [],
      );
      const versionIdsToUpdate = candidateVersionIds.filter((versionId) =>
        playlistVersionIds.has(versionId),
      );

      if (versionIdsToUpdate.length === 0) {
        toast.showError("No valid draft notes found in current playlist");
        return;
      }

      // Apply the label to all valid versions with individual error handling
      const updateResults = await Promise.allSettled(
        versionIdsToUpdate.map(async (versionId) => {
          try {
            // Get existing draft content
            const content = noteDrafts[versionId] || "";

            // Save with new label
            await playlistStore.saveDraft(
              playlist.id,
              versionId,
              content,
              labelId,
            );
            return { versionId, success: true };
          } catch (error) {
            console.warn(
              `[useNoteManagement] Failed to set label for version ${versionId}:`,
              error,
            );
            return { versionId, success: false, error };
          }
        }),
      );

      // Count successful updates and collect failures
      const successfulUpdates = updateResults
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<{
            versionId: string;
            success: true;
          }> => result.status === "fulfilled" && result.value.success,
        )
        .map((result) => result.value.versionId);

      const failedUpdates = updateResults.filter(
        (
          result,
        ): result is
          | PromiseFulfilledResult<{
              versionId: string;
              success: false;
              error: any;
            }>
          | PromiseRejectedResult =>
          result.status === "rejected" ||
          (result.status === "fulfilled" && !result.value.success),
      ).length;

      // Update in memory for successful updates only
      if (successfulUpdates.length > 0) {
        const newLabelIds = { ...noteLabelIds };
        successfulUpdates.forEach((versionId) => {
          newLabelIds[versionId] = labelId;
        });
        setNoteLabelIds(newLabelIds);
      }

      const selectionMode =
        selectedDraftVersionIds.length > 0 ? "selected" : "all draft";

      // Show appropriate success/error message
      if (failedUpdates === 0) {
        toast.showSuccess(
          `Applied label to ${successfulUpdates.length} note${successfulUpdates.length > 1 ? "s" : ""} (${selectionMode})`,
        );
      } else if (successfulUpdates.length > 0) {
        toast.showWarning(
          `Applied label to ${successfulUpdates.length} notes, ${failedUpdates} failed (${selectionMode})`,
        );
      } else {
        toast.showError("Failed to apply labels to any notes");
      }
    } catch (error) {
      console.error("Failed to set labels for notes:", error);
      toast.showError("Failed to apply labels");
    }
  };

  // Calculate the number of drafts (notes that aren't empty or already published)
  const getDraftCount = useCallback((): number => {
    return Object.entries(noteStatuses).filter(
      ([, status]) => status === "draft",
    ).length;
  }, [noteStatuses]);

  // Provide stable callback references to avoid recreating handlers on each render
  const saveNoteDraftRef = useRef(saveNoteDraft);
  useEffect(() => {
    saveNoteDraftRef.current = saveNoteDraft;
  }, [saveNoteDraft]);
  const stableSaveNoteDraft = useCallback(
    (
      versionId: string,
      content: string,
      labelId: string,
      attachments?: Attachment[],
    ) => saveNoteDraftRef.current(versionId, content, labelId, attachments),
    [],
  );

  const clearNoteDraftRef = useRef(clearNoteDraft);
  useEffect(() => {
    clearNoteDraftRef.current = clearNoteDraft;
  }, [clearNoteDraft]);
  const stableClearNoteDraft = useCallback(
    (versionId: string) => clearNoteDraftRef.current(versionId),
    [],
  );

  const toggleVersionSelectionRef = useRef(toggleVersionSelection);
  useEffect(() => {
    toggleVersionSelectionRef.current = toggleVersionSelection;
  }, [toggleVersionSelection]);
  const stableToggleVersionSelection = useCallback(
    (versionId: string) => toggleVersionSelectionRef.current(versionId),
    [],
  );

  return {
    noteDrafts,
    noteStatuses,
    noteLabelIds,
    noteAttachments,
    selectedVersions,
    isPublishing,
    lastPublishTime,
    progress,
    publishedVersionsCount,
    publishingErrors,
    showPublishModal,
    versionsToPublish,
    isPending,
    saveNoteDraft: stableSaveNoteDraft,
    clearNoteDraft: stableClearNoteDraft,
    toggleVersionSelection: stableToggleVersionSelection,
    publishSelectedNotes: publishSelectedNotesWithModal,
    publishAllNotes: publishAllNotesWithModal,
    publishNotesSequentially,
    clearAllNotes,
    setAllLabels,
    isUserInteracting,
    getDraftCount,
    clearAllSelections,
    closePublishModal,
  };
}
