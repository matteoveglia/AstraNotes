/**
 * @fileoverview VideoPlayer.tsx
 * Custom video player with frame-by-frame navigation and simple controls.
 * Supports keyboard navigation and auto-hiding controls.
 * @component
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  /** Video source URL */
  src: string;
  /** Video title for accessibility */
  title: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when video fails to load */
  onError?: () => void;
  /** Callback when video loads successfully */
  onLoad?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title,
  className,
  onError,
  onLoad,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [frameRate, setFrameRate] = useState(24); // Default 24fps
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();
  const frameUpdateRef = useRef<number>();

  // Use 1/30 second increments for universal frame stepping
  // Works well for most common frame rates (24, 25, 30, 60fps)
  const FRAME_STEP = 1 / 30;

  // Auto-hide controls after 3 seconds of no mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    // Hide controls after delay regardless of play state
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Hide controls on mouse leave regardless of play state
    setShowControls(false);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        await videoRef.current.pause();
        setIsPlaying(false);
        setShowControls(true);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Video playback error:", error);
      onError?.();
    }
  }, [isPlaying, onError]);

  // Keyboard navigation for frame-by-frame - scoped to container
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current || !containerRef.current) return;

      // Only handle if the video player container is focused or contains active element
      if (!containerRef.current.contains(document.activeElement)) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          // Show controls when navigating frames and keep them visible
          setShowControls(true);
          if (hideControlsTimeoutRef.current) {
            clearTimeout(hideControlsTimeoutRef.current);
          }
          // Keep controls visible for 5 seconds after frame navigation
          hideControlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
          }, 5000);
          // Go back one frame step
          videoRef.current.currentTime = Math.max(
            0,
            videoRef.current.currentTime - FRAME_STEP,
          );
          // Update currentTime immediately for responsive UI
          setCurrentTime(videoRef.current.currentTime);
          break;
        case "ArrowRight":
          e.preventDefault();
          // Show controls when navigating frames and keep them visible
          setShowControls(true);
          if (hideControlsTimeoutRef.current) {
            clearTimeout(hideControlsTimeoutRef.current);
          }
          // Keep controls visible for 5 seconds after frame navigation
          hideControlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
          }, 5000);
          // Go forward one frame step
          videoRef.current.currentTime = Math.min(
            videoRef.current.duration || 0,
            videoRef.current.currentTime + FRAME_STEP,
          );
          // Update currentTime immediately for responsive UI
          setCurrentTime(videoRef.current.currentTime);
          break;
        case " ":
        case "Spacebar":
          e.preventDefault();
          togglePlayPause();
          break;
      }
    };

    const container = containerRef.current;
    container?.addEventListener("keydown", handleKeyDown);
    return () => container?.removeEventListener("keydown", handleKeyDown);
  }, [FRAME_STEP, togglePlayPause]);

  // Auto-focus container when video loads for immediate keyboard control
  useEffect(() => {
    if (!isLoading && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isLoading]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isDragging) {
      // Direct update for better responsiveness during playback
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [isDragging]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
      onLoad?.();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Handle timeline dragging
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;

    // Prevent text selection during drag
    e.preventDefault();

    setIsDragging(true);
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, percent * duration));
    setDragTime(newTime);

    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleTimelineMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !timelineRef.current || !duration) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newTime = Math.max(0, Math.min(duration, percent * duration));
      setDragTime(newTime);

      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
    },
    [isDragging, duration],
  );

  const handleTimelineMouseUp = useCallback(() => {
    if (isDragging) {
      // Sync currentTime with the final drag position to prevent snapping
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      setIsDragging(false);
      setDragTime(0);
    }
  }, [isDragging]);

  // Global mouse events for timeline dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleTimelineMouseMove);
      document.addEventListener("mouseup", handleTimelineMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleTimelineMouseMove);
        document.removeEventListener("mouseup", handleTimelineMouseUp);
      };
    }
  }, [isDragging, handleTimelineMouseMove, handleTimelineMouseUp]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (frameUpdateRef.current) {
        cancelAnimationFrame(frameUpdateRef.current);
      }
    };
  }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Calculate frame count with memoization for better performance
  const getCurrentFrame = useCallback(
    (time: number) => {
      return Math.floor(time * frameRate) + 1;
    },
    [frameRate],
  );

  const totalFrames = useMemo(() => {
    return Math.floor(duration * frameRate);
  }, [duration, frameRate]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const dragPercent =
    duration > 0 && isDragging ? (dragTime / duration) * 100 : progressPercent;

  // Memoize current frame to avoid recalculation on every render
  const currentFrame = useMemo(() => {
    return getCurrentFrame(isDragging ? dragTime : currentTime);
  }, [getCurrentFrame, isDragging, dragTime, currentTime]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-lg overflow-hidden outline-none",
        "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900",
        isDragging && "select-none", // Prevent text selection during drag
        className,
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="application"
      aria-label={`Video player for ${title}. Use arrow keys for frame navigation, space to play/pause.`}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => onError?.()}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
        playsInline
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Frame count display - part of controls */}
        <div className="absolute top-4 right-4 text-white text-opacity-80 text-sm bg-black bg-opacity-40 rounded px-2 font-mono">
          {duration > 0 && (
            <div className="text-right">
              <div className="text-[0.725rem]">
                Frame {currentFrame}/{totalFrames}
              </div>
            </div>
          )}
        </div>
        {/* Play/pause button in center */}
        <button
          onClick={togglePlayPause}
          className="absolute inset-0 flex items-center justify-center group"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          <div className="bg-black bg-opacity-50 rounded-full p-3 group-hover:bg-opacity-70 transition-all">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white" />
            ) : (
              <Play className="w-8 h-8 text-white ml-1" />
            )}
          </div>
        </button>

        {/* Progress bar and time */}
        <div className="bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex items-center gap-3 text-white text-sm">
            <span>{formatTime(isDragging ? dragTime : currentTime)}</span>

            <div className="flex-1 relative">
              <div
                ref={timelineRef}
                className="h-3 bg-white bg-opacity-30 rounded cursor-pointer relative select-none"
                onMouseDown={handleTimelineMouseDown}
              >
                <div
                  className={cn(
                    "h-full bg-white rounded",
                    isDragging ? "" : "transition-all duration-75",
                  )}
                  style={{ width: `${dragPercent}%` }}
                />
                {/* Scrubber handle */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/4 w-3 h-3 bg-white rounded-full border-2 border-blue-600 cursor-grab active:cursor-grabbing"
                  style={{ left: `${dragPercent}%`, marginLeft: "-6px" }}
                />
              </div>

              {/* Drag tooltip */}
              {isDragging && (
                <div
                  className="absolute -top-8 bg-black bg-opacity-75 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap"
                  style={{
                    left: `${dragPercent}%`,
                    transform: "translateX(-50%)",
                    minWidth: "60px",
                  }}
                >
                  Frame {getCurrentFrame(dragTime)}
                </div>
              )}
            </div>

            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="absolute top-4 left-4 text-white text-xs bg-black bg-opacity-50 rounded px-2 py-1 opacity-0 hover:opacity-100 transition-opacity">
        ← → Frame by frame • Space = Play/Pause • Drag timeline to scrub
      </div>
    </div>
  );
};
