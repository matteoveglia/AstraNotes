/**
 * @fileoverview WhatsNewModal.tsx
 * Modal for displaying release notes and what's new information.
 * Fetches latest release data from GitHub and displays formatted release notes.
 * Shows automatically on first launch after an update.
 * @component
 */

import React, { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWhatsNewStore } from "@/store/whatsNewStore";
import { ReleaseNotesSuspense } from "@/components/ReleaseNotesSuspense";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getVersion } from "@tauri-apps/api/app";
import { refreshReleaseData } from "@/services/releaseNotesService";

interface WhatsNewModalProps {
  /** Whether the modal should attempt to show automatically on mount */
  autoShow?: boolean;
  /** Callback when the modal is explicitly closed by the user or autoShow logic */
  onModalShouldClose?: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  autoShow = false,
  onModalShouldClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");

  const { markAsShown } = useWhatsNewStore();

  const fetchAppVersion = useCallback(async () => {
    if (!appVersion) {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (err) {
        console.error("Failed to get app version:", err);
      }
    }
  }, [appVersion]);

  useEffect(() => {
    if (autoShow) {
      setIsOpen(true);
    }
  }, [autoShow]);

  useEffect(() => {
    if (isOpen) {
      fetchAppVersion();
    }
  }, [isOpen, fetchAppVersion]);

  const handleOpenChange = (openState: boolean) => {
    setIsOpen(openState);
    if (!openState) {
      if (appVersion) {
        markAsShown(appVersion);
      }
      onModalShouldClose?.();
    }
  };

  const handleRetry = () => {
    refreshReleaseData();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="What's New">
          <Sparkles className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              What's New in AstraNotes
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="h-[500px] overflow-y-auto py-4">
          <ErrorBoundary
            fallback={(error, resetError) => (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <h3 className="font-medium mb-2">Failed to load release notes</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {error.message || "An unexpected error occurred"}
                  </p>
                  <Button onClick={resetError} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          >
            <ReleaseNotesSuspense 
              appVersion={appVersion} 
              onRetry={handleRetry}
            />
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
};
