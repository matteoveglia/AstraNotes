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
import { Play, Image, AlertCircle, X } from "lucide-react";
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
  versionId: string; // NEW: Add versionId for video fetching
}

export const ThumbnailModal: React.FC<ThumbnailModalProps> = ({
  isOpen,
  onClose,
  thumbnailUrl,
  versionName,
  versionNumber,
  versionId,
}) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoAvailable, setIsVideoAvailable] = useState<boolean | null>(
    null,
  );
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Check video availability when modal opens
  useEffect(() => {
    if (isOpen && versionId) {
      checkVideoAvailability();
    }
  }, [isOpen, versionId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowVideo(false);
      setVideoUrl(null);
      setVideoError(null);
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

  if (!thumbnailUrl && !showVideo) return null;

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
                        <Play className="w-4 h-4" />
                        {isLoadingVideo ? "Loading..." : "Play Reviewable"}
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

            {!showVideo && !videoError && thumbnailUrl && (
              <motion.img
                key="thumbnail"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                src={thumbnailUrl}
                alt={`${versionName} - v${versionNumber}`}
                className="max-h-[70vh] max-w-full object-contain"
              />
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
