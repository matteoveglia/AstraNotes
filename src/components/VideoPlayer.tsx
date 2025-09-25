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
import {
  useVideoPlayback,
  useVideoControls,
  useTimelineScrubbing,
  useKeyboardShortcuts,
} from "@/hooks/video";

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Original state that might remain or be adjusted
  const [frameRate, setFrameRate] = useState(24); // Default 24fps
  // const frameUpdateRef = useRef<number>(); // This was for an animation frame, check if still needed or how to integrate

  const FRAME_STEP = 1 / 30; // Universal frame stepping

  const {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    togglePlayPause,
    // handleTimeUpdate, // Managed internally by useVideoPlayback mostly
    // handleLoadedMetadata, // Managed internally by useVideoPlayback
    // handleVideoEnded, // Managed internally by useVideoPlayback
  } = useVideoPlayback({ videoRef, onError, onLoad });

  const {
    showControls,
    setShowControls, // Keep direct access for specific scenarios
    handleMouseMove: handleControlsMouseMove, // Rename to avoid conflict if any
    handleMouseLeave: handleControlsMouseLeave, // Rename
    resetHideControlsTimeout,
    clearHideControlsTimeout,
  } = useVideoControls({ isPlaying });

  // Callback for when scrubbing directly updates video.currentTime
  const handleScrubTimeUpdate = useCallback((newTime: number) => {
    // This callback might be used if the hook needed to inform the player of updates
    // For now, useVideoPlayback's internal handleTimeUpdate will pick up changes
    // unless isDragging is active.
    // We need to ensure currentTime in VideoPlayer reflects scrubbed time for UI.
    // The useVideoPlayback hook's currentTime will update from video events.
    // The useTimelineScrubbing hook's dragTime is the source of truth during drag.
  }, []);

  const { isDragging, dragTime, handleTimelineMouseDown } =
    useTimelineScrubbing({
      videoRef,
      timelineRef,
      duration,
      onScrubStart: () => {
        // When scrubbing starts, ensure controls don't auto-hide
        clearHideControlsTimeout();
        setShowControls(true);
      },
      onScrubEnd: (finalTime) => {
        // When scrubbing ends, sync VideoPlayer's currentTime if needed
        // and restart auto-hide timer for controls
        if (videoRef.current) {
          // setCurrentTime(videoRef.current.currentTime); // useVideoPlayback will update this from video events
        }
        resetHideControlsTimeout();
      },
      onTimeUpdateDuringScrub: (newTime) => {
        // The dragTime state from useTimelineScrubbing will be used for UI during drag
      },
    });

  // Modify handleTimeUpdate from useVideoPlayback to consider isDragging
  // This requires useVideoPlayback to either accept isDragging or VideoPlayer to manage it
  // For now, VideoPlayer's rendering logic will use `isDragging ? dragTime : currentTime`

  // Handler for frame navigation to show controls
  const handleFrameNavigation = useCallback(() => {
    setShowControls(true);
    resetHideControlsTimeout(5000); // Keep controls visible for 5s
    // Manually update currentTime display if needed, though video.currentTime change should trigger update
    if (videoRef.current) {
      // setCurrentTime(videoRef.current.currentTime); // Let useVideoPlayback handle this
    }
  }, [setShowControls, resetHideControlsTimeout, videoRef]);

  useKeyboardShortcuts({
    videoRef,
    containerRef,
    frameStep: FRAME_STEP,
    togglePlayPause: async () => {
      // Ensure togglePlayPause from useVideoPlayback is correctly called
      await togglePlayPause();
      // After toggling play/pause, manage control visibility
      if (!isPlaying) {
        // If it was playing, it's now paused
        setShowControls(true); // Show controls when paused by spacebar
        clearHideControlsTimeout(); // Don't auto-hide when paused
      } else {
        // If it was paused, it's now playing
        resetHideControlsTimeout(); // Start auto-hide when playing
      }
    },
    onFrameNavigation: handleFrameNavigation,
  });

  // Auto-focus container when video loads for immediate keyboard control
  useEffect(() => {
    if (!isLoading && containerRef.current) {
      // Check if an input element is not already focused within the container
      const activeElement = document.activeElement;
      if (
        !containerRef.current.contains(activeElement) ||
        activeElement?.tagName.toLowerCase() !== "input"
      ) {
        containerRef.current.focus();
      }
    }
  }, [isLoading]);

  // Original handleLoadedMetadata logic for frameRate (if still desired)
  // This part was specific to VideoPlayer, not purely playback.
  useEffect(() => {
    const video = videoRef.current;
    if (video && duration > 0) {
      // duration > 0 indicates metadata is loaded
      const videoElement = video as any;
      if (videoElement.getVideoPlaybackQuality) {
        try {
          // const quality = videoElement.getVideoPlaybackQuality();
          // Frame rate detection is unreliable, stick to default or make configurable
          setFrameRate(24);
        } catch (error) {
          console.debug(
            "[VideoPlayer] Frame rate detection not available or failed",
          );
        }
      }
    }
  }, [duration, videoRef]);

  // Cleanup for any raw animation frames (if frameUpdateRef was used)
  // useEffect(() => {
  //   return () => {
  //     if (frameUpdateRef.current) {
  //       cancelAnimationFrame(frameUpdateRef.current);
  //     }
  //   };
  // }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getCurrentFrame = useCallback(
    (time: number) => {
      return Math.floor(time * frameRate) + 1;
    },
    [frameRate],
  );

  const totalFrames = useMemo(() => {
    return Math.floor(duration * frameRate);
  }, [duration, frameRate]);

  // Determine effective current time for display: if dragging, use dragTime.
  const effectiveCurrentTime = isDragging ? dragTime : currentTime;

  const progressPercent =
    duration > 0 ? (effectiveCurrentTime / duration) * 100 : 0;
  // dragPercent is essentially progressPercent now as dragTime is part of effectiveCurrentTime logic
  // const dragPercent = duration > 0 && isDragging ? (dragTime / duration) * 100 : progressPercent;

  const currentFrameDisplay = useMemo(() => {
    return getCurrentFrame(effectiveCurrentTime);
  }, [getCurrentFrame, effectiveCurrentTime]);

  // Controls visibility logic: useVideoControls handles mouse move/leave.
  // Specific calls to setShowControls(true/false) can still be made.

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-lg overflow-hidden outline-none",
        "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900",
        isDragging && "select-none",
        className,
      )}
      onMouseMove={handleControlsMouseMove} // Use hook's handler
      onMouseLeave={handleControlsMouseLeave} // Use hook's handler
      tabIndex={0} // Ensure focusability for keyboard shortcuts
      role="application"
      aria-label={`Video player for ${title}. Use arrow keys for frame navigation, space to play/pause.`}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        // Event listeners like onTimeUpdate, onLoadedMetadata, onError, onEnded
        // are now managed by the useVideoPlayback hook.
        // We pass onError to useVideoPlayback.
        // onLoad is also passed to useVideoPlayback.
        preload="metadata"
        playsInline
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none", // Added pointer-events-none when hidden
        )}
      >
        <div className="absolute top-4 right-4 text-white/80 text-sm bg-black/40 rounded px-2 font-mono">
          {duration > 0 && (
            <div className="text-right">
              <div className="text-[0.725rem]">
                Frame {currentFrameDisplay}/{totalFrames}
              </div>
            </div>
          )}
        </div>

        {/* Play/Pause button in center - only show if controls are visible or always?
            Original showed it as part of the controls overlay.
            If it should be clickable even when controls are "hidden", it needs separate visibility logic.
            Assuming it's part of the main controls bundle for now.
        */}
        <button
          onClick={async () => {
            await togglePlayPause();
            // Manage control visibility after click
            if (!isPlaying) {
              // If it was playing, it's now paused
              setShowControls(true); // Show controls when paused
              clearHideControlsTimeout();
            } else {
              // If it was paused, it's now playing
              resetHideControlsTimeout();
            }
          }}
          className="absolute inset-0 flex items-center justify-center group"
          aria-label={isPlaying ? "Pause" : "Play"}
          // Disable button if loading to prevent interaction issues?
          disabled={isLoading}
        >
          <div className="bg-black/50 rounded-full p-4 group-hover:bg-black/70 transition-all">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white" />
            ) : (
              <Play className="w-8 h-8 text-white pl-1" />
            )}
          </div>
        </button>

        <div className="bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex items-center gap-3 text-white text-sm">
            <span>{formatTime(effectiveCurrentTime)}</span>

            <div className="flex-1 relative">
              <div
                ref={timelineRef}
                className="h-3 bg-white/30 rounded cursor-pointer relative select-none"
                onMouseDown={handleTimelineMouseDown} // From useTimelineScrubbing
              >
                <div
                  className={cn(
                    "h-full bg-white rounded",
                    isDragging ? "" : "transition-all duration-75",
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-blue-600 cursor-grab active:cursor-grabbing"
                  style={{ left: `${progressPercent}%`, marginLeft: "-6px" }} // Use marginLeft to center small handle
                />
              </div>

              {isDragging && (
                <div
                  className="absolute -top-8 bg-black/75 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap"
                  style={{
                    left: `${progressPercent}%`,
                    transform: "translateX(-50%)",
                    minWidth: "60px",
                  }}
                >
                  Frame {getCurrentFrame(dragTime)}{" "}
                  {/* Show frame for dragTime specifically */}
                </div>
              )}
            </div>

            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Keyboard hints - consider making visibility tied to showControls or always visible on hover of parent */}
      <div className="absolute top-4 left-4 text-white text-xs bg-black/50 rounded px-2 py-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100 peer-focus:opacity-100 hover:opacity-100 transition-opacity whitespace-nowrap">
        <div className="font-semibold mb-1">Controls:</div>
        <div>← → Frame navigation</div>
        <div>Space = Play/Pause</div>
        <div>Click/Drag timeline to scrub</div>
      </div>
    </div>
  );
};
