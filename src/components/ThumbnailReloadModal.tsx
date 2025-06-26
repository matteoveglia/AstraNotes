/**
 * @fileoverview ThumbnailReloadModal.tsx
 * Modal component for reloading thumbnails with progress tracking.
 * Provides user feedback during the thumbnail refresh process.
 * @component
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { ftrackService } from "../services/ftrack";
import {
  forceRefreshThumbnail,
  createCacheIntegration,
} from "../services/thumbnailService";
// Removed clearThumbnailsFromGlobalCache - now using Suspense-based thumbnails
import { useToast } from "./ui/toast";
import type { Playlist } from "../types";

interface ThumbnailReloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist | null;
}

type ReloadStep = "setup" | "clearing" | "connecting" | "loading" | "complete";

type ReloadState = "loading" | "success" | "error";

const STEP_DESCRIPTIONS = {
  setup: "Setting up cache integration...",
  clearing: "Clearing cached thumbnails...",
  connecting: "Connecting to ftrack...",
  loading: "Loading fresh thumbnails...",
  complete: "Thumbnails reloaded successfully!",
} as const;

export const ThumbnailReloadModal: React.FC<ThumbnailReloadModalProps> = ({
  isOpen,
  onClose,
  playlist,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<ReloadStep>("setup");
  const [state, setState] = useState<ReloadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setCurrentStep("setup");
      setState("loading");
      setError(null);

      if (playlist) {
        startReload();
      }
    }
  }, [isOpen, playlist]);

  const updateProgress = (step: ReloadStep, progressValue: number) => {
    setCurrentStep(step);
    setProgress(progressValue);
  };

  const startReload = async () => {
    if (!playlist) return;

    try {
      // Step 1: Setup cache integration (0-20%)
      updateProgress("setup", 20);
      await new Promise((resolve) => setTimeout(resolve, 300));
      createCacheIntegration();

      // Step 2: Clear cached thumbnails (20-40%) - No longer needed with Suspense
      updateProgress("clearing", 40);
      const versionsWithThumbnails =
        playlist.versions?.filter((v: any) => v.thumbnailId) || [];
      // Cache clearing not needed with Suspense-based thumbnails
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 3: Connect to ftrack (40-60%)
      updateProgress("connecting", 60);
      const session = await ftrackService.getSession();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 4: Load fresh thumbnails (60-90%)
      updateProgress("loading", 60);
      const totalThumbnails = versionsWithThumbnails.length;

      for (let i = 0; i < versionsWithThumbnails.length; i++) {
        const version = versionsWithThumbnails[i];
        if ((version as any).thumbnailId) {
          try {
            await forceRefreshThumbnail(
              (version as any).thumbnailId,
              session,
              { size: 512 },
              (version as any).id,
            );
            const stepProgress =
              60 + Math.round(((i + 1) / totalThumbnails) * 30);
            setProgress(stepProgress);
          } catch (error) {
            console.debug(
              `[ThumbnailReload] Failed to reload thumbnail for ${(version as any).id}:`,
              error,
            );
          }
        }
      }

      // Step 5: Complete (90-100%)
      updateProgress("complete", 100);
      await new Promise((resolve) => setTimeout(resolve, 500));

      setState("success");
      toast.showToast("Thumbnails reloaded successfully", "success");

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error("[ThumbnailReload] Failed to reload thumbnails:", error);
      setState("error");
      setError(
        error instanceof Error ? error.message : "Failed to reload thumbnails",
      );
      toast.showToast("Failed to reload thumbnails", "error");
    }
  };

  const handleRetry = () => {
    setProgress(0);
    setCurrentStep("setup");
    setState("loading");
    setError(null);
    if (playlist) {
      startReload();
    }
  };

  const getTotalThumbnails = (): number => {
    return playlist?.versions?.filter((v: any) => v.thumbnailId).length || 0;
  };

  const getStatusIcon = () => {
    switch (state) {
      case "loading":
        return null;
      case "success":
        return <CheckCircle className="h-5 w-5 pr-1.5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 pr-1.5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (state) {
      case "loading":
        return STEP_DESCRIPTIONS[currentStep];
      case "success":
        return "Thumbnails reloaded successfully!";
      case "error":
        return error || "Failed to reload thumbnails";
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case "loading":
        return "text-foreground";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
    }
  };

  const canClose = state !== "loading";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Only allow closing if not loading
        if (!open && canClose) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        // Disable close button when loading
        onPointerDownOutside={(e) => {
          if (!canClose) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (!canClose) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state === "loading" ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : state === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : state === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
            Reload Thumbnails
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex items-center h-6">{getStatusIcon()}</div>
            <div className="flex-1">
              <div className={`font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </div>
              <div className="h-5 mt-1">
                {state === "loading" && (
                  <div className="text-sm text-muted-foreground">
                    Reloading {getTotalThumbnails()} thumbnails
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {state === "error" && error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {state === "error" ? (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleRetry}>Retry</Button>
            </div>
          ) : state === "success" ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <Button variant="outline" onClick={onClose} disabled={!canClose}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
