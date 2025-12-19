/**
 * @fileoverview VideoPlayer.tsx
 * Custom video player with frame-by-frame navigation and simple controls.
 * Supports keyboard navigation and auto-hiding controls.
 * @component
 */

import type React from "react";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Play, Pause, Volume1, Volume2, VolumeX } from "lucide-react";
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
	const [volume, setVolume] = useState(1);
	const [isMuted, setIsMuted] = useState(false);
	const [previousVolume, setPreviousVolume] = useState(1);
	const [isVolumePopoverVisible, setIsVolumePopoverVisible] = useState(false);
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

	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		const handleVolumeChange = () => {
			setVolume(video.volume);
			const muted = video.muted || video.volume === 0;
			setIsMuted(muted);
			if (!muted && video.volume > 0) {
				setPreviousVolume(video.volume);
			}
		};

		handleVolumeChange();
		video.addEventListener("volumechange", handleVolumeChange);

		return () => {
			video.removeEventListener("volumechange", handleVolumeChange);
		};
	}, [duration]);

	const hideVolumePopoverTimeoutRef = useRef<number | null>(null);
	const sliderAreaRef = useRef<HTMLDivElement | null>(null);
	const isAdjustingVolumeRef = useRef(false);

	const cancelHideVolumePopover = useCallback(() => {
		if (hideVolumePopoverTimeoutRef.current !== null) {
			window.clearTimeout(hideVolumePopoverTimeoutRef.current);
			hideVolumePopoverTimeoutRef.current = null;
		}
	}, []);

	const scheduleHideVolumePopover = useCallback(() => {
		cancelHideVolumePopover();
		hideVolumePopoverTimeoutRef.current = window.setTimeout(() => {
			setIsVolumePopoverVisible(false);
			hideVolumePopoverTimeoutRef.current = null;
		}, 150);
	}, [cancelHideVolumePopover]);

	useEffect(() => {
		return () => {
			cancelHideVolumePopover();
		};
	}, [cancelHideVolumePopover]);
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

	const updateVolumeFromClientY = useCallback((clientY: number) => {
		const video = videoRef.current;
		const slider = sliderAreaRef.current;
		if (!video || !slider) {
			return;
		}

		const rect = slider.getBoundingClientRect();
		if (rect.height === 0) {
			return;
		}

		const relative = rect.bottom - clientY;
		const percent = Math.min(Math.max(relative / rect.height, 0), 1);

		video.volume = percent;

		if (percent === 0) {
			video.muted = true;
			setIsMuted(true);
		} else {
			if (video.muted) {
				video.muted = false;
			}
			setIsMuted(false);
			setPreviousVolume(percent);
		}

		setVolume(percent);
	}, []);

	const handleVolumePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			cancelHideVolumePopover();
			setIsVolumePopoverVisible(true);
			setShowControls(true);
			clearHideControlsTimeout();
			isAdjustingVolumeRef.current = true;
			updateVolumeFromClientY(event.clientY);

			const handlePointerMove = (moveEvent: PointerEvent) => {
				if (!isAdjustingVolumeRef.current) {
					return;
				}
				updateVolumeFromClientY(moveEvent.clientY);
			};

			const handlePointerUp = () => {
				isAdjustingVolumeRef.current = false;
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", handlePointerUp);
				scheduleHideVolumePopover();
				resetHideControlsTimeout();
			};

			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", handlePointerUp, { once: true });
		},
		[
			cancelHideVolumePopover,
			clearHideControlsTimeout,
			resetHideControlsTimeout,
			scheduleHideVolumePopover,
			setShowControls,
			updateVolumeFromClientY,
		],
	);

	const handleMuteToggle = useCallback(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		if (isMuted || video.volume === 0) {
			const restoredVolume = previousVolume > 0 ? previousVolume : 0.5;
			video.muted = false;
			video.volume = restoredVolume;
			setVolume(restoredVolume);
			setIsMuted(false);
		} else {
			const volumeToStore = video.volume > 0 ? video.volume : volume || 0.5;
			setPreviousVolume(volumeToStore);
			video.volume = 0;
			video.muted = true;
			setVolume(0);
			setIsMuted(true);
		}
	}, [isMuted, previousVolume, volume]);

	const VolumeIcon = useMemo(() => {
		if (isMuted || volume === 0) {
			return VolumeX;
		}

		if (volume < 0.5) {
			return Volume1;
		}

		return Volume2;
	}, [isMuted, volume]);

	const progressPercent =
		duration > 0 ? (effectiveCurrentTime / duration) * 100 : 0;
	// dragPercent is essentially progressPercent now as dragTime is part of effectiveCurrentTime logic
	// const dragPercent = duration > 0 && isDragging ? (dragTime / duration) * 100 : progressPercent;

	const currentFrameDisplay = useMemo(() => {
		return getCurrentFrame(effectiveCurrentTime);
	}, [getCurrentFrame, effectiveCurrentTime]);

	// Controls visibility logic: useVideoControls handles mouse move/leave.
	// Specific calls to setShowControls(true/false) can still be made.

	const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

	const handleVolumeAreaEnter = useCallback(() => {
		cancelHideVolumePopover();
		setIsVolumePopoverVisible(true);
		setShowControls(true);
		clearHideControlsTimeout();
	}, [cancelHideVolumePopover, clearHideControlsTimeout, setShowControls]);

	const handleVolumeAreaLeave = useCallback(() => {
		if (isAdjustingVolumeRef.current) {
			return;
		}
		scheduleHideVolumePopover();
		resetHideControlsTimeout();
	}, [resetHideControlsTimeout, scheduleHideVolumePopover]);

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
					showControls ? "opacity-100" : "opacity-0 pointer-events-none",
				)}
			>
				<div className="absolute top-4 right-4 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2 font-bold text-white shadow-[0_12px_32px_-16px_rgba(12,12,19,0.9)]">
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
					<div className="rounded-full border  border-white/10 bg-zinc-900/65 hover:bg-zinc-900/80 p-4 text-white shadow-[0_18px_38px_-18px_rgba(12,12,19,0.85)] transition-all">
						{isPlaying ? (
							<Pause className="w-8 h-8 text-white" />
						) : (
							<Play className="w-8 h-8 text-white pl-1" />
						)}
					</div>
				</button>

				<div className="px-5 pb-6">
					<div className="flex items-center gap-5 rounded-[2.5rem] border border-white/10 bg-zinc-900/75 px-3.5  text-white shadow-[0_24px_45px_-22px_rgba(12,12,19,0.85)]">
						<span className="text-sm font-bold text-white">
							{formatTime(effectiveCurrentTime)}
						</span>

						<div className="flex-1 relative">
							<div
								ref={timelineRef}
								className="relative h-2 cursor-pointer select-none rounded-full bg-white/15"
								onMouseDown={handleTimelineMouseDown} // From useTimelineScrubbing
							>
								<div
									className={cn(
										"h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500",
										isDragging ? "" : "transition-all duration-75",
									)}
									style={{ width: `${progressPercent}%` }}
								/>
								<div
									className="absolute top-1/2 -translate-y-1/2 h-3 w-4 cursor-grab rounded-full border border-white/40 bg-white shadow-[0_6px_12px_rgba(15,23,42,0.45)] active:cursor-grabbing"
									style={{ left: `${progressPercent}%`, marginLeft: "-8px" }}
								/>
							</div>

							{isDragging && (
								<div
									className="absolute -top-10 rounded-2xl border border-white/10 bg-zinc-900/70 px-2 py-1 text-xs font-bold text-white shadow-[0_10px_28px_-18px_rgba(12,12,19,0.9)] pointer-events-none whitespace-nowrap"
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

						<span className="text-sm font-bold text-white">
							{formatTime(duration)}
						</span>

						<div
							className="relative ml-auto flex items-center"
							onMouseEnter={handleVolumeAreaEnter}
							onMouseLeave={handleVolumeAreaLeave}
						>
							<button
								type="button"
								onClick={handleMuteToggle}
								className="rounded-full p-2.5 text-white"
								aria-label={
									isMuted || volume === 0 ? "Unmute audio" : "Mute audio"
								}
								title={isMuted || volume === 0 ? "Unmute audio" : "Mute audio"}
							>
								<VolumeIcon className="h-4.5 w-4.5" />
							</button>

							<div
								className={cn(
									"absolute bottom-full right-0 left-[-0.1rem] mb-1 flex flex-col items-center transition-all duration-200 ease-out",
									isVolumePopoverVisible
										? "pointer-events-auto translate-y-0 opacity-100"
										: "pointer-events-none translate-y-2 opacity-0",
								)}
								onMouseEnter={handleVolumeAreaEnter}
								onMouseLeave={handleVolumeAreaLeave}
							>
								<div className="flex min-h-[2rem] w-[2.5rem] flex-col items-center rounded-3xl border border-white/10 bg-zinc-900/70 pt-3 text-white shadow-[0_12px_32px_-14px_rgba(12,12,19,0.85)]">
									<span className="text-[0.74rem] mb-6 font-bold tracking-wide text-white">
										{volumePercent}
									</span>

									<div
										ref={sliderAreaRef}
										className="relative h-28 w-10 cursor-pointer touch-none select-none"
										role="slider"
										aria-label="Adjust volume"
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={volumePercent}
										onPointerDown={handleVolumePointerDown}
									>
										<div className="absolute left-1/2 top-[-0.5rem] bottom-4 w-1.5 -translate-x-1/2 rounded-full bg-white/32" />

										<div
											className="absolute left-1/2 bottom-4 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-t from-blue-500 via-sky-400 to-sky-300"
											style={{ height: `calc(${volumePercent}% * 0.88)` }}
										/>

										<div
											className="absolute left-1/2 w-3 h-5 rounded-full border border-white/35 bg-gradient-to-br from-white to-slate-100 shadow-[0_6px_14px_rgba(15,23,42,0.4)]"
											style={{
												bottom: `calc(${volumePercent}% * 0.88 + 20px)`,
												transform: "translate(-50%, 50%)",
											}}
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Keyboard hints - consider making visibility tied to showControls or always visible on hover of parent */}
			<div className="absolute top-4 left-4 rounded-2xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-white opacity-0 shadow-[0_12px_28px_-18px_rgba(12,12,19,0.85)] transition-opacity whitespace-nowrap focus-within:opacity-100 group-hover:opacity-100 peer-focus:opacity-100 hover:opacity-100">
				<div className="mb-1 font-semibold">Controls:</div>
				<div>← → Frame navigation</div>
				<div>Space = Play/Pause</div>
				<div>Click/Drag timeline to scrub</div>
			</div>
		</div>
	);
};
