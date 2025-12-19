/**
 * @fileoverview useKeyboardShortcuts.ts
 * Hook for managing video player keyboard shortcuts.
 */
import { useEffect, useCallback, type RefObject } from "react";

interface UseKeyboardShortcutsProps {
	videoRef: RefObject<HTMLVideoElement | null>;
	containerRef: RefObject<HTMLDivElement | null>; // For focus check
	frameStep: number;
	togglePlayPause: () => void;
	onFrameNavigation?: () => void; // Callback when frame navigation occurs
	isEnabled?: boolean; // To conditionally enable/disable shortcuts
}

export const useKeyboardShortcuts = ({
	videoRef,
	containerRef,
	frameStep,
	togglePlayPause,
	onFrameNavigation,
	isEnabled = true, // Enabled by default
}: UseKeyboardShortcutsProps) => {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!videoRef.current || !containerRef.current || !isEnabled) return;

			// Only handle if the video player container is focused or contains active element
			if (!containerRef.current.contains(document.activeElement)) return;

			let navigated = false;
			switch (e.key) {
				case "ArrowLeft":
					e.preventDefault();
					videoRef.current.currentTime = Math.max(
						0,
						videoRef.current.currentTime - frameStep,
					);
					navigated = true;
					break;
				case "ArrowRight":
					e.preventDefault();
					videoRef.current.currentTime = Math.min(
						videoRef.current.duration || 0,
						videoRef.current.currentTime + frameStep,
					);
					navigated = true;
					break;
				case " ": // Note: e.key for space can be " " or "Spacebar"
				case "Spacebar":
					e.preventDefault();
					togglePlayPause();
					break;
			}

			if (navigated) {
				onFrameNavigation?.();
			}
		},
		[
			videoRef,
			containerRef,
			frameStep,
			togglePlayPause,
			onFrameNavigation,
			isEnabled,
		],
	);

	useEffect(() => {
		const container = containerRef.current;
		if (container && isEnabled) {
			// Ensure container is focusable to receive keydown events
			// It should already have tabIndex={0} in the component
			container.addEventListener("keydown", handleKeyDown);
			return () => container.removeEventListener("keydown", handleKeyDown);
		}
	}, [containerRef, handleKeyDown, isEnabled]);

	// No return value needed as this hook only sets up event listeners
};
