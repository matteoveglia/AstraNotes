/**
 * @fileoverview ShotNoteItem.tsx
 * Component for displaying individual notes in the threaded notes view.
 * Shows user info, timestamps, note content, version thumbnail, labels, and attachments.
 * @component
 */

import type React from "react";
import { cn } from "@/lib/utils";
import { ThumbnailSuspense } from "./ui/ThumbnailSuspense";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { NoteLabelPill } from "./NoteLabelPill";
import { BorderTrail } from "@/components/ui/border-trail";
import {
	Loader2,
	Paperclip,
	Download,
	Image as ImageIcon,
	FileText,
	File,
} from "lucide-react";
import type { ShotNote, NoteAttachment } from "@/types/relatedNotes";

interface ShotNoteItemProps {
	note: ShotNote;
	onThumbnailClick: (versionId: string, thumbnailId?: string) => void;
	onAttachmentClick: (attachment: NoteAttachment) => void;
	className?: string;
}

export const ShotNoteItem: React.FC<ShotNoteItemProps> = ({
	note,
	onThumbnailClick,
	onAttachmentClick,
	className,
}) => {
	// Format timestamp as relative time
	const formatTimestamp = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		// For older dates, show the actual date
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		});
	};

	// Get user display name
	const getUserDisplayName = () => {
		const fullName =
			`${note.user.firstName || ""} ${note.user.lastName || ""}`.trim();
		if (fullName) {
			return fullName;
		}

		// Clean up username - remove email domain if present
		const username = note.user.username;
		if (username.includes("@")) {
			return username.split("@")[0];
		}

		return username;
	};

	// Get user initials for avatar fallback
	const getUserInitials = () => {
		const displayName = getUserDisplayName();
		const parts = displayName.split(" ");
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}
		return displayName.slice(0, 2).toUpperCase();
	};

	// Get attachment icon based on type (supports MIME or extension like ".jpg")
	const getAttachmentIcon = (attachment: NoteAttachment) => {
		const t = (attachment.type || "").toLowerCase();
		const isImage =
			t.startsWith("image/") ||
			[".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".bmp"].some((ext) =>
				t.endsWith(ext),
			);
		if (isImage) return <ImageIcon className="h-4 w-4" />;
		if (t.includes("text") || t.includes("document") || t.endsWith(".pdf")) {
			return <FileText className="h-4 w-4" />;
		}
		return <File className="h-4 w-4" />;
	};

	// Format file size
	const formatFileSize = (bytes?: number) => {
		if (!bytes) return "";
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
	};

	const handleThumbnailClick = () => {
		onThumbnailClick(note.version.id, note.version.thumbnailId);
	};

	const handleAttachmentClick = (attachment: NoteAttachment) => {
		onAttachmentClick(attachment);
	};

	return (
		<div
			className={cn(
				"flex gap-4 p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors",
				className,
			)}
		>
			{/* User Avatar */}
			<div className="shrink-0">
				<div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-600 dark:text-zinc-300">
					{note.user.avatarUrl ? (
						<img
							src={note.user.avatarUrl}
							alt={getUserDisplayName()}
							className="w-full h-full rounded-full object-cover"
						/>
					) : (
						getUserInitials()
					)}
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 min-w-0">
				{/* Header with user info and timestamp */}
				<div className="flex items-center gap-2 mb-2">
					<span className="font-medium text-zinc-900 dark:text-zinc-100">
						{getUserDisplayName()}
					</span>
					{note.user.username !== getUserDisplayName() && (
						<span className="text-sm text-zinc-500 dark:text-zinc-400">
							@
							{note.user.username.includes("@")
								? note.user.username.split("@")[0]
								: note.user.username}
						</span>
					)}
					<span className="text-zinc-300 dark:text-zinc-600">•</span>
					<span className="text-sm text-zinc-500 dark:text-zinc-400">
						{formatTimestamp(note.createdAt)}
					</span>
					<span className="text-zinc-300 dark:text-zinc-600">•</span>
					<span className="text-sm text-zinc-500 dark:text-zinc-400">
						{note.version.name} v{note.version.version}
					</span>
				</div>

				{/* Note Content */}
				<div className="mb-3">
					<MarkdownRenderer
						content={note.content}
						className="text-zinc-800 dark:text-zinc-200 prose prose-sm max-w-none"
					/>
				</div>

				{/* Labels */}
				{note.labels.length > 0 && (
					<div className="flex flex-wrap gap-1 mb-3">
						{note.labels.map((label) => (
							<NoteLabelPill key={label.id} label={label} size="sm" />
						))}
					</div>
				)}

				{/* Attachments */}
				{note.attachments.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{note.attachments.map((attachment) => (
							<button
								key={attachment.id}
								onClick={() => handleAttachmentClick(attachment)}
								className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
								title={`${attachment.name}${attachment.size ? ` (${formatFileSize(attachment.size)})` : ""}`}
							>
								{getAttachmentIcon(attachment)}
								<span className="truncate max-w-32">{attachment.name}</span>
								{attachment.size && (
									<span className="text-xs text-zinc-500 dark:text-zinc-400">
										{formatFileSize(attachment.size)}
									</span>
								)}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Version Thumbnail (match NoteInput styling) */}
			<div className="shrink-0">
				<div
					className={cn(
						"shrink-0 w-32 h-[85px] bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden flex items-center justify-center",
						note.version.thumbnailId
							? "cursor-pointer hover:opacity-80"
							: "cursor-default",
					)}
					onClick={note.version.thumbnailId ? handleThumbnailClick : undefined}
					title={
						note.version.thumbnailId
							? "Click to view media"
							: "No thumbnail available"
					}
				>
					{note.version.thumbnailId ? (
						<ThumbnailSuspense
							thumbnailId={note.version.thumbnailId}
							alt={`${note.version.name} v${note.version.version}`}
							className="w-full h-full object-contain"
							fallback={
								<div className="relative flex h-full w-full flex-col items-center justify-center rounded-md bg-zinc-200 px-5 py-2 dark:bg-zinc-800">
									<BorderTrail
										style={{
											boxShadow:
												"0px 0px 60px 30px rgb(255 255 255 / 50%), 0 0 100px 60px rgb(0 0 0 / 50%), 0 0 140px 90px rgb(0 0 0 / 50%)",
										}}
										size={100}
									/>
									<div
										className="flex h-full animate-pulse flex-col items-start justify-center space-y-2"
										role="status"
										aria-label="Loading..."
									>
										<Loader2 className="w-6 h-6 animate-spin" />
									</div>
								</div>
							}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
							<div className="text-center">
								<ImageIcon className="w-6 h-6 mx-auto text-zinc-400 dark:text-zinc-500 mb-1" />
								<div className="text-xs text-zinc-500 dark:text-zinc-400">
									No thumbnail
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
