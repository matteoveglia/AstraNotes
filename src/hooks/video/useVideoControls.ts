/**
 * @fileoverview useVideoControls.ts
 * Hook for managing video player controls visibility.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";

interface UseVideoControlsProps {
  initialShowState?: boolean;
  autoHideDelay?: number;
  isPlaying?: boolean; // Optional: to influence control hiding
}

interface UseVideoControlsReturn {
  showControls: boolean;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>; // Expose setter for direct control
  handleMouseMove: () => void;
  handleMouseLeave: () => void;
  resetHideControlsTimeout: (customDelay?: number) => void;
  clearHideControlsTimeout: () => void;
}

export const useVideoControls = ({
  initialShowState = true,
  autoHideDelay = 3000,
  isPlaying = false, // Default to false, can be passed from playback hook
}: UseVideoControlsProps): UseVideoControlsReturn => {
  const [showControls, setShowControls] = useState(initialShowState);
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  }, []);

  const resetHideControlsTimeout = useCallback(
    (customDelay?: number) => {
      clearHideControlsTimeout();
      // Don't hide if video is paused and controls are meant to be shown
      // This behavior is now mostly handled by direct setShowControls(true) in VideoPlayer
      // and this hook just manages the auto-hide part.
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, customDelay ?? autoHideDelay);
    },
    [autoHideDelay, clearHideControlsTimeout],
  );

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    resetHideControlsTimeout();
  }, [resetHideControlsTimeout]);

  const handleMouseLeave = useCallback(() => {
    // Hide controls on mouse leave only if not paused
    // Or, always hide - depends on desired UX. Current VideoPlayer hides regardless.
    // For simplicity, this hook will just manage the timeout part.
    // Parent component can decide to call setShowControls(false) directly on mouse leave if needed.
    // Let's stick to the VideoPlayer's original logic of hiding on mouse leave.
    if (!isPlaying) {
      // Only start timeout if not playing, otherwise it's instant
      resetHideControlsTimeout(100); // Short delay to prevent flicker
    } else {
      setShowControls(false); // If playing, hide immediately on mouse leave as per original logic
    }
  }, [isPlaying, resetHideControlsTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHideControlsTimeout();
    };
  }, [clearHideControlsTimeout]);

  return {
    showControls,
    setShowControls,
    handleMouseMove,
    handleMouseLeave,
    resetHideControlsTimeout,
    clearHideControlsTimeout,
  };
};
