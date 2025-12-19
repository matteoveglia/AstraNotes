/**
 * @fileoverview useTimelineScrubbing.ts
 * Hook for managing video timeline scrubbing interactions.
 */
import type React from "react";
import { useState, useCallback, useEffect, type RefObject } from "react";

interface UseTimelineScrubbingProps {
	videoRef: RefObject<HTMLVideoElement | null>;
	timelineRef: RefObject<HTMLDivElement | null>;
	duration: number;
	onScrubStart?: () => void;
	onScrubEnd?: (finalTime: number) => void;
	onTimeUpdateDuringScrub?: (currentTime: number) => void;
}

interface UseTimelineScrubbingReturn {
	isDragging: boolean;
	dragTime: number;
	handleTimelineMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
	// We might not need to expose handleSeek if mousedown covers it.
}

export const useTimelineScrubbing = ({
	videoRef,
	timelineRef,
	duration,
	onScrubStart,
	onScrubEnd,
	onTimeUpdateDuringScrub,
}: UseTimelineScrubbingProps): UseTimelineScrubbingReturn => {
	const [isDragging, setIsDragging] = useState(false);
	const [dragTime, setDragTime] = useState(0);

	const handleTimelineMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!timelineRef.current || !duration || !videoRef.current) return;
			e.preventDefault(); // Prevent text selection

			setIsDragging(true);
			onScrubStart?.();

			const rect = timelineRef.current.getBoundingClientRect();
			const percent = (e.clientX - rect.left) / rect.width;
			const newTime = Math.max(0, Math.min(duration, percent * duration));

			setDragTime(newTime);
			videoRef.current.currentTime = newTime;
			onTimeUpdateDuringScrub?.(newTime);
		},
		[timelineRef, duration, videoRef, onScrubStart, onTimeUpdateDuringScrub],
	);

	const handleTimelineMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDragging || !timelineRef.current || !duration || !videoRef.current)
				return;

			const rect = timelineRef.current.getBoundingClientRect();
			const percent = (e.clientX - rect.left) / rect.width;
			const newTime = Math.max(0, Math.min(duration, percent * duration));

			setDragTime(newTime);
			videoRef.current.currentTime = newTime;
			onTimeUpdateDuringScrub?.(newTime);
		},
		[isDragging, timelineRef, duration, videoRef, onTimeUpdateDuringScrub],
	);

	const handleTimelineMouseUp = useCallback(() => {
		if (isDragging) {
			setIsDragging(false);
			if (videoRef.current) {
				onScrubEnd?.(videoRef.current.currentTime);
			}
			// No need to setDragTime(0) here, it represents current scrub position
		}
	}, [isDragging, videoRef, onScrubEnd]);

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

	return {
		isDragging,
		dragTime,
		handleTimelineMouseDown,
	};
};
