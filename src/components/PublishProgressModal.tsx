/**
 * @fileoverview PublishProgressModal.tsx
 * Modal component for publishing notes with progress tracking.
 * Provides user feedback during the note publishing process.
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
import { CheckCircle, AlertCircle, Loader2, Send } from "lucide-react";
import { useToast } from "./ui/toast";

interface PublishProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionsToPublish: string[];
  onPublish: (
    versionIds: string[],
    onProgress: (
      current: number,
      total: number,
      versionId: string,
      step: string,
    ) => void,
  ) => Promise<{ success: string[]; failed: string[] }>;
}

type PublishStep = "preparing" | "publishing" | "complete";

type PublishState = "loading" | "success" | "error";

const STEP_DESCRIPTIONS = {
  preparing: "Preparing notes for publishing...",
  publishing: "Publishing notes to ftrack...",
  complete: "Notes published successfully!",
} as const;

export const PublishProgressModal: React.FC<PublishProgressModalProps> = ({
  isOpen,
  onClose,
  versionsToPublish,
  onPublish,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<PublishStep>("preparing");
  const [state, setState] = useState<PublishState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [currentStepDescription, setCurrentStepDescription] =
    useState<string>("");
  const [publishedCount, setPublishedCount] = useState(0);
  const [failedVersions, setFailedVersions] = useState<string[]>([]);
  const toast = useToast();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && versionsToPublish.length > 0) {
      setProgress(0);
      setCurrentStep("preparing");
      setState("loading");
      setError(null);
      setCurrentVersion("");
      setCurrentStepDescription("");
      setPublishedCount(0);
      setFailedVersions([]);

      startPublishing();
    }
  }, [isOpen, versionsToPublish]);

  const updateProgress = (
    current: number,
    total: number,
    versionId: string,
    step: string,
  ) => {
    const progressValue = Math.round((current / total) * 100);
    setProgress(progressValue);
    setCurrentVersion(versionId);
    setCurrentStepDescription(step);
    setPublishedCount(current);
  };

  const startPublishing = async () => {
    if (versionsToPublish.length === 0) return;

    try {
      // Step 1: Preparing (0-10%)
      setCurrentStep("preparing");
      setProgress(10);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 2: Publishing (10-90%)
      setCurrentStep("publishing");

      const result = await onPublish(versionsToPublish, updateProgress);

      setFailedVersions(result.failed);

      // Step 3: Complete (90-100%)
      setCurrentStep("complete");
      setProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (result.failed.length === 0) {
        setState("success");
        toast.showToast(
          `Successfully published ${result.success.length} notes`,
          "success",
        );
      } else if (result.success.length === 0) {
        setState("error");
        setError(`Failed to publish all ${result.failed.length} notes`);
        toast.showToast("Failed to publish notes", "error");
      } else {
        setState("success");
        const message = `Published ${result.success.length} notes successfully, ${result.failed.length} failed`;
        toast.showToast(message, "warning");
      }

      // Auto-close after 2 seconds if all successful
      if (result.failed.length === 0) {
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error("[PublishProgress] Failed to publish notes:", error);
      setState("error");
      setError(
        error instanceof Error ? error.message : "Failed to publish notes",
      );
      toast.showToast("Failed to publish notes", "error");
    }
  };

  const handleRetry = () => {
    setProgress(0);
    setCurrentStep("preparing");
    setState("loading");
    setError(null);
    setCurrentVersion("");
    setCurrentStepDescription("");
    setPublishedCount(0);
    setFailedVersions([]);

    if (versionsToPublish.length > 0) {
      startPublishing();
    }
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
        if (currentStepDescription) {
          return currentStepDescription;
        }
        return STEP_DESCRIPTIONS[currentStep];
      case "success":
        if (failedVersions.length > 0) {
          return `Published ${publishedCount} notes, ${failedVersions.length} failed`;
        }
        return "Notes published successfully!";
      case "error":
        return error || "Failed to publish notes";
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case "loading":
        return "text-foreground";
      case "success":
        return failedVersions.length > 0 ? "text-yellow-600" : "text-green-600";
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
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : state === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : state === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            Publish Notes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex-1">
              <div className={`font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </div>
              <div className="h-5 mt-1">
                {state === "loading" && (
                  <div className="text-sm text-muted-foreground">
                    {currentVersion && `Processing: ${currentVersion}`}
                    {!currentVersion &&
                      `Publishing ${versionsToPublish.length} notes`}
                  </div>
                )}
                {state === "success" && failedVersions.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {publishedCount} of {versionsToPublish.length} notes
                    published
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
                className={`h-2 rounded-full transition-all duration-300 ease-out ${
                  state === "error"
                    ? "bg-red-500"
                    : state === "success" && failedVersions.length > 0
                      ? "bg-yellow-500"
                      : "bg-primary"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {state === "error" && error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-md">
              {error}
            </div>
          )}

          {state === "success" && failedVersions.length > 0 && (
            <div className="text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded-md">
              {failedVersions.length} notes failed to publish. You can retry or
              check individual notes.
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
