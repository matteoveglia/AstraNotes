/**
 * @fileoverview useVideoPlayback.ts
 * Hook for managing core video playback logic.
 */
import { useState, useCallback, useEffect, RefObject } from "react";

interface UseVideoPlaybackProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  onError?: () => void;
  onLoad?: () => void;
}

interface UseVideoPlaybackReturn {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  togglePlayPause: () => Promise<void>;
  handleTimeUpdate: () => void;
  handleLoadedMetadata: () => void;
  handleVideoEnded: () => void;
}

export const useVideoPlayback = ({
  videoRef,
  onError,
  onLoad,
}: UseVideoPlaybackProps): UseVideoPlaybackReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (isPlaying) {
        await videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Video playback error:", error);
      onError?.();
    }
  }, [isPlaying, onError, videoRef]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
      onLoad?.();
    }
  }, [onLoad, videoRef]);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    // Optionally reset currentTime to 0 or seek to start
    // if (videoRef.current) videoRef.current.currentTime = 0;
  }, []);

  // Effect to attach and detach event listeners from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("ended", handleVideoEnded);
      video.addEventListener("error", onError || (() => {})); // Add basic error listener
      video.addEventListener("canplay", () => setIsLoading(false)); // Also set loading to false on canplay

      // Initial check for duration if metadata is already loaded
      if (video.readyState >= 1) {
        // HAVE_METADATA
        handleLoadedMetadata();
      }

      return () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("ended", handleVideoEnded);
        video.removeEventListener("error", onError || (() => {}));
        video.removeEventListener("canplay", () => setIsLoading(false));
      };
    }
  }, [
    videoRef,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleVideoEnded,
    onError,
  ]);

  return {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    togglePlayPause,
    handleTimeUpdate, // Exposed in case direct manipulation needed, though internal now
    handleLoadedMetadata, // Exposed for similar reasons or direct call
    handleVideoEnded,
  };
};
