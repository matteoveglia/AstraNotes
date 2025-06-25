/**
 * @fileoverview SyncConflictManager.tsx
 * Manages sync conflicts by listening to playlist store events and showing conflict resolution dialog.
 * This component should be mounted in the main App component to handle global sync conflicts.
 */

import React, { useState, useEffect } from "react";
import {
  SyncConflictDialog,
  type SyncConflictDetails,
} from "./SyncConflictDialog";
import { playlistStore } from "@/store/playlist";
import { useToast } from "@/components/ui/toast";

export function SyncConflictManager() {
  const [conflictDetails, setConflictDetails] =
    useState<SyncConflictDetails | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast, showError } = useToast();

  // Add mount detection
  console.debug("[SyncConflictManager] Component mounted and rendered");

  useEffect(() => {
    console.debug(
      "[SyncConflictManager] Setting up event listeners for sync conflicts",
    );

    const handleSyncConflictDetected = (eventData: any) => {
      console.debug("[SyncConflictManager] Sync conflict detected:", eventData);

      setConflictDetails({
        playlistId: eventData.playlistId,
        playlistName: eventData.playlistName,
        playlistType: eventData.playlistType,
        projectId: eventData.projectId,
        errorMessage: eventData.errorMessage,
      });
    };

    const handleSyncConflictResolved = (eventData: any) => {
      console.debug("[SyncConflictManager] Sync conflict resolved:", eventData);

      // Close dialog
      setConflictDetails(null);
      setIsProcessing(false);

      // Show success message
      if (eventData.action === "renamed") {
        showToast(
          `Playlist renamed to "${eventData.newName}" and sync completed`,
          "success",
        );
      } else if (eventData.action === "cancelled") {
        showToast(
          "Sync cancelled. You can resolve the conflict in ftrack and try again.",
          "default",
        );
      }
    };

    const handleSyncCompleted = (eventData: any) => {
      // If we're processing a conflict resolution, this means the retry succeeded
      if (isProcessing) {
        console.debug(
          "[SyncConflictManager] Conflict resolution sync completed:",
          eventData,
        );
        setIsProcessing(false);
      }
    };

    const handleSyncFailed = (eventData: any) => {
      // If we're processing a conflict resolution and it fails, show error
      if (isProcessing) {
        console.error(
          "[SyncConflictManager] Conflict resolution sync failed:",
          eventData,
        );
        setIsProcessing(false);
        showError("Failed to sync after renaming. Please try again.");
      }
    };

    // Listen to playlist store events
    playlistStore.on("sync-name-conflict-detected", handleSyncConflictDetected);
    playlistStore.on("sync-conflict-resolved", handleSyncConflictResolved);
    playlistStore.on("sync-completed", handleSyncCompleted);
    playlistStore.on("sync-failed", handleSyncFailed);

    return () => {
      playlistStore.off(
        "sync-name-conflict-detected",
        handleSyncConflictDetected,
      );
      playlistStore.off("sync-conflict-resolved", handleSyncConflictResolved);
      playlistStore.off("sync-completed", handleSyncCompleted);
      playlistStore.off("sync-failed", handleSyncFailed);
    };
  }, [isProcessing]);

  const handleCancel = async () => {
    if (!conflictDetails) return;

    try {
      await playlistStore.cancelSyncDueToConflict(conflictDetails.playlistId);
      // Event handler will close dialog and show toast
    } catch (error) {
      console.error("[SyncConflictManager] Failed to cancel sync:", error);
      showError("Failed to cancel sync");
    }
  };

  const handleRename = async (newName: string) => {
    if (!conflictDetails) return;

    setIsProcessing(true);

    try {
      await playlistStore.resolveConflictAndRetry(
        conflictDetails.playlistId,
        newName,
      );
      // Event handlers will manage the rest
    } catch (error) {
      console.error("[SyncConflictManager] Failed to resolve conflict:", error);
      setIsProcessing(false);
      showError("Failed to resolve conflict and retry sync");
    }
  };

  return (
    <SyncConflictDialog
      isOpen={!!conflictDetails}
      conflictDetails={conflictDetails}
      onCancel={handleCancel}
      onRename={handleRename}
      isProcessing={isProcessing}
    />
  );
}
