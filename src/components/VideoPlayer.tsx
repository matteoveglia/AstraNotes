/**
 * @fileoverview VideoPlayer.tsx
 * Custom video player with frame-by-frame navigation and simple controls.
 * Supports keyboard navigation and auto-hiding controls.
 * @component
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Use 1/30 second increments for universal frame stepping
  // Works well for most common frame rates (24, 25, 30, 60fps)
  const FRAME_STEP = 1/30;

  // Auto-hide controls after 3 seconds of no mouse movement
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      setShowControls(false);
    }
  }, [isPlaying]);

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
      console.error('Video playback error:', error);
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
        case 'ArrowLeft':
          e.preventDefault();
          // Go back one frame step
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - FRAME_STEP);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Go forward one frame step
          videoRef.current.currentTime = Math.min(
            videoRef.current.duration || 0,
            videoRef.current.currentTime + FRAME_STEP
          );
          break;
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          togglePlayPause();
          break;
      }
    };

    const container = containerRef.current;
    container?.addEventListener('keydown', handleKeyDown);
    return () => container?.removeEventListener('keydown', handleKeyDown);
  }, [FRAME_STEP, togglePlayPause]);

  // Auto-focus container when video loads for immediate keyboard control
  useEffect(() => {
    if (!isLoading && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isLoading]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-lg overflow-hidden outline-none",
        "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900",
        className
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
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
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
            <span>{formatTime(currentTime)}</span>
            
            <div
              className="flex-1 h-2 bg-white bg-opacity-30 rounded cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-white rounded"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="absolute top-4 right-4 text-white text-xs bg-black bg-opacity-50 rounded px-2 py-1 opacity-0 hover:opacity-100 transition-opacity">
        ← → Frame by frame • Space = Play/Pause
      </div>
    </div>
  );
}; 