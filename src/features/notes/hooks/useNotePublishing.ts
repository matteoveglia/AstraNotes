/**
 * @fileoverview useNotePublishing.ts
 * Custom hook for managing note publishing operations.
 * Handles publishing selected notes and all notes.
 */

import { useState, useCallback } from "react";
import { ftrackService } from "@/services/ftrack";
import { playlistStore } from "@/store/playlist";

interface PublishResult {
  success: boolean;
  versionId: string;
  error?: unknown;
}

export function useNotePublishing(
  playlistId: string,
  noteDrafts: Record<string, string>,
  noteStatuses: Record<string, string>,
  noteLabelIds: Record<string, string>,
) {
  const [isPublishing, setIsPublishing] = useState(false);

  // Publish selected versions
  const publishSelected = useCallback(
    async (selectedVersions: string[]) => {
      if (selectedVersions.length === 0)
        return { success: false, message: "No versions selected" };

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
              return { success: true, versionId } as PublishResult;
            } catch (error) {
              console.error(
                `Failed to publish note for version ${versionId}:`,
                error,
              );
              return { success: false, versionId, error } as PublishResult;
            }
          });

        const results = await Promise.all(publishPromises);
        const failures = results.filter((r) => !r.success);

        if (failures.length > 0) {
          console.error("Failed to publish some notes:", failures);
          return {
            success: false,
            message: `Failed to publish ${failures.length} notes`,
            results,
          };
        }

        // Only update status for successfully published notes
        const successfulVersions = results
          .filter((r) => r.success)
          .map((r) => r.versionId);

        // Keep content but mark as published
        for (const versionId of successfulVersions) {
          await playlistStore.saveNoteStatus(
            versionId,
            playlistId,
            "published",
            noteDrafts[versionId],
          );
        }

        return {
          success: true,
          message: `Published ${successfulVersions.length} notes successfully`,
          results,
        };
      } catch (error) {
        console.error("Failed to publish selected notes:", error);
        return { success: false, message: "Failed to publish notes", error };
      } finally {
        setIsPublishing(false);
      }
    },
    [playlistId, noteDrafts, noteStatuses, noteLabelIds],
  );

  // Publish all notes
  const publishAll = useCallback(
    async (currentVersionIds?: Set<string>) => {
      try {
        setIsPublishing(true);

        const publishPromises = Object.entries(noteDrafts)
          .filter(([versionId, content]) => content && content.trim() !== "") // Filter out empty notes
          .filter(([versionId]) => noteStatuses[versionId] !== "published") // Filter out already published notes
          .filter(
            ([versionId]) =>
              !currentVersionIds || currentVersionIds.has(versionId),
          ) // Only publish notes for versions in current playlist
          .map(async ([versionId, content]) => {
            try {
              const labelId = noteLabelIds[versionId];
              await ftrackService.publishNote(versionId, content, labelId);
              return { success: true, versionId } as PublishResult;
            } catch (error) {
              console.error(
                `Failed to publish note for version ${versionId}:`,
                error,
              );
              return { success: false, versionId, error } as PublishResult;
            }
          });

        const results = await Promise.all(publishPromises);
        const failures = results.filter((r) => !r.success);

        if (failures.length > 0) {
          console.error("Failed to publish some notes:", failures);
          return {
            success: false,
            message: `Failed to publish ${failures.length} notes`,
            results,
          };
        }

        // Only update status for successfully published notes
        const successfulVersions = results
          .filter((r) => r.success)
          .map((r) => r.versionId);

        // Keep content but mark as published
        for (const versionId of successfulVersions) {
          await playlistStore.saveNoteStatus(
            versionId,
            playlistId,
            "published",
            noteDrafts[versionId],
          );
        }

        return {
          success: true,
          message: `Published ${successfulVersions.length} notes successfully`,
          results,
        };
      } catch (error) {
        console.error("Failed to publish notes:", error);
        return { success: false, message: "Failed to publish notes", error };
      } finally {
        setIsPublishing(false);
      }
    },
    [playlistId, noteDrafts, noteStatuses, noteLabelIds],
  );

  return {
    isPublishing,
    publishSelected,
    publishAll,
  };
}
