/**
 * @fileoverview ThumbnailModal.tsx
 * Modal component for displaying thumbnails and playing reviewable videos.
 * Provides responsive image viewer with video playback capability.
 * @component
 */

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { VideoPlayer } from "./VideoPlayer";
import { videoService } from "../services/videoService";
import { ftrackService } from "../services/ftrack";
import { fetchThumbnail } from "../services/thumbnailService";
import { Play, Image, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { motion, AnimatePresence } from "motion/react";

interface ThumbnailModalProps {
  isOpen: boolean;
  onClose: () => void;
  thumbnailUrl: string | null;
  versionName: string;
  versionNumber: string;
  versionId: string;
  thumbnailId?: string; // NEW: Add thumbnailId for refreshing
}

export const ThumbnailModal: React.FC<ThumbnailModalProps> = ({
  isOpen,
  onClose,
  thumbnailUrl: initialThumbnailUrl,
  versionName,
  versionNumber,
  versionId,
  thumbnailId,
}) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoAvailable, setIsVideoAvailable] = useState<boolean | null>(
    null,
  );
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(initialThumbnailUrl);
  const [isRefreshingThumbnail, setIsRefreshingThumbnail] = useState(false);

  // Update thumbnail URL when prop changes
  useEffect(() => {
    setCurrentThumbnailUrl(initialThumbnailUrl);
  }, [initialThumbnailUrl]);

  // Check video availability and refresh thumbnail when modal opens
  useEffect(() => {
    if (isOpen && versionId) {
      checkVideoAvailability();
      refreshThumbnailIfNeeded();
    }
  }, [isOpen, versionId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowVideo(false);
      setVideoUrl(null);
      setVideoError(null);
      setIsRefreshingThumbnail(false);
    }
  }, [isOpen]);

  const checkVideoAvailability = async () => {
    try {
      const available = await videoService.isVideoAvailable(versionId);
      setIsVideoAvailable(available);
    } catch (error) {
      console.error("Failed to check video availability:", error);
      setIsVideoAvailable(false);
    }
  };

  const refreshThumbnailIfNeeded = async () => {
    // If we have a thumbnailId but the current URL seems to be a broken blob URL, refresh it
    if (thumbnailId && currentThumbnailUrl && currentThumbnailUrl.startsWith('blob:')) {
      setIsRefreshingThumbnail(true);
      try {
        const session = await ftrackService.getSession();
        const freshUrl = await fetchThumbnail(thumbnailId, session, { size: 512 }, versionId);
        if (freshUrl && freshUrl !== currentThumbnailUrl) {
          console.debug("[ThumbnailModal] Refreshed thumbnail URL for version", versionId);
          setCurrentThumbnailUrl(freshUrl);
        }
      } catch (error) {
        console.debug("[ThumbnailModal] Failed to refresh thumbnail:", error);
      } finally {
        setIsRefreshingThumbnail(false);
      }
    }
  };

  const handlePlayVideo = async () => {
    if (!versionId) return;

    setIsLoadingVideo(true);
    setVideoError(null);

    try {
      const url = await videoService.getVideoUrl(versionId);

      if (url) {
        setVideoUrl(url);
        setShowVideo(true);
      } else {
        setVideoError("Video not available");
        setIsVideoAvailable(false);
      }
    } catch (error) {
      console.error("Failed to load video:", error);
      setVideoError("Failed to load video");
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const handleBackToThumbnail = () => {
    setShowVideo(false);
    setVideoError(null);
  };

  const handleVideoError = () => {
    setVideoError("Failed to play video");
    setShowVideo(false);
  };

  const handleThumbnailError = () => {
    // If thumbnail fails to load, try to refresh it
    if (thumbnailId && !isRefreshingThumbnail) {
      refreshThumbnailIfNeeded();
    }
  };

  if (!currentThumbnailUrl && !showVideo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <span>
              {versionName} - v{versionNumber}
            </span>

            <div className="flex items-center gap-2 mr-5">
              {/* Back to thumbnail button when showing video */}
              {showVideo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToThumbnail}
                  className="flex items-center gap-2"
                >
                  <Image className="w-4 h-4" />
                  Thumbnail
                </Button>
              )}

              {/* Play video button */}
              {!showVideo && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handlePlayVideo}
                        disabled={isVideoAvailable === false || isLoadingVideo}
                        className="flex items-center gap-2"
                      >
                        {isLoadingVideo ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Play Reviewable
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    {isVideoAvailable === false && (
                      <TooltipContent>
                        <p>Reviewable video not available for this version</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center min-h-[400px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {videoError && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <AlertCircle className="w-12 h-12 text-red-500" />
                <div>
                  <h3 className="text-lg font-semibold text-red-600 mb-2">
                    Video Error
                  </h3>
                  <p className="text-zinc-600">{videoError}</p>
                  <Button
                    variant="outline"
                    onClick={handleBackToThumbnail}
                    className="mt-4"
                  >
                    Back to Thumbnail
                  </Button>
                </div>
              </motion.div>
            )}

            {showVideo && videoUrl && !videoError && (
              <motion.div
                key="video"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="w-full"
              >
                <VideoPlayer
                  src={videoUrl}
                  title={`${versionName} - v${versionNumber}`}
                  className="w-full max-h-[70vh]"
                  onError={handleVideoError}
                  onLoad={() => console.log("Video loaded successfully")}
                />
              </motion.div>
            )}

            {!showVideo && !videoError && currentThumbnailUrl && (
              <motion.div
                key="thumbnail"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="relative"
              >
                {isRefreshingThumbnail && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                  </div>
                )}
                <img
                  src={currentThumbnailUrl}
                  alt={`${versionName} - v${versionNumber}`}
                  className="max-h-[70vh] max-w-full object-contain"
                  onError={handleThumbnailError}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Video controls hint */}
        {showVideo && (
          <div className="text-center text-sm text-zinc-400 mt-2">
            Use arrow keys for frame-by-frame navigation • Space to play/pause
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
