/**
 * @fileoverview WhatsNewModal.tsx
 * Modal for displaying release notes and what's new information.
 * Fetches latest release data from GitHub and displays formatted release notes.
 * Shows automatically on first launch after an update.
 * @component
 */

import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { githubService, GitHubRelease } from "@/services/githubService";
import { useWhatsNewStore } from "@/store/whatsNewStore";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";

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
  const [isLoading, setIsLoading] = useState(true); // Start as true so loading shows immediately when modal opens
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");

  const { cachedRelease, lastFetchedAt, setCachedRelease, markAsShown } =
    useWhatsNewStore();

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

  const fetchReleaseData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const oneHour = 60 * 60 * 1000;
    if (
      cachedRelease &&
      lastFetchedAt &&
      Date.now() - lastFetchedAt < oneHour
    ) {
      console.log(
        "Using fresh cached GitHub release data for What's New modal.",
      );
      setRelease(cachedRelease);
      setIsLoading(false);
      return;
    }

    console.log("Fetching latest GitHub release data for What's New modal.");
    try {
      const releaseData = await githubService.getLatestRelease();
      setRelease(releaseData);
      setCachedRelease(releaseData);
    } catch (err) {
      console.error("Failed to load release data:", err);
      setError(
        "Failed to load release information. Please check your internet connection or try again later.",
      );
      if (cachedRelease) {
        console.warn(
          "Using stale cached GitHub release data due to fetch error.",
        );
        setRelease(cachedRelease);
      }
    } finally {
      setIsLoading(false);
    }
  }, [cachedRelease, lastFetchedAt, setCachedRelease]);

  useEffect(() => {
    if (autoShow) {
      setIsOpen(true);
    }
  }, [autoShow]);

  useEffect(() => {
    if (isOpen) {
      // Check if we have fresh cached data first
      const oneHour = 60 * 60 * 1000;
      const hasFreshCache =
        cachedRelease && lastFetchedAt && Date.now() - lastFetchedAt < oneHour;

      if (hasFreshCache) {
        // Use cached data immediately, no loading state needed
        setRelease(cachedRelease);
        setIsLoading(false);
        setError(null);
      } else {
        // Need to fetch, show loading state
        setIsLoading(true);
        setError(null);
        setRelease(null);
        // Only fetch if we don't have fresh cache
        fetchReleaseData();
      }

      fetchAppVersion();
    } else {
      // Reset state when modal closes (but don't clear cached data)
      setIsLoading(true); // Reset to loading state for next time
      setError(null);
      // Don't clear release here - let it persist for next open
    }
  }, [isOpen, fetchAppVersion, fetchReleaseData, cachedRelease, lastFetchedAt]);

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
    setError(null);
    fetchReleaseData();
  };

  const handleOpenInGitHub = async () => {
    if (release?.html_url) {
      try {
        await open(release.html_url);
      } catch (error) {
        console.error("Failed to open URL:", error);
        window.open(release.html_url, "_blank");
      }
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
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
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">
                  Loading latest release notes...
                </p>
              </div>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <p className="text-sm text-red-500 mb-4">{error}</p>
                <Button onClick={handleRetry} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && release && (
            <div className="flex flex-col h-full">
              <div className="flex-shrink-0 border-b pb-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {release.name || release.tag_name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Released on {formatDate(release.published_at)}
                      {appVersion && ` • Your version: ${appVersion}`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInGitHub}
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View on GitHub
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <MarkdownRenderer
                  content={githubService.formatReleaseNotes(release.body)}
                  className="text-sm prose dark:prose-invert max-w-none"
                />
              </div>
            </div>
          )}

          {!isLoading && !error && !release && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                No release information found.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
