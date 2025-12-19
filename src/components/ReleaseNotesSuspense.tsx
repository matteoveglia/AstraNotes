/**
 * @fileoverview ReleaseNotesSuspense.tsx
 * Suspense-wrapped release notes component that automatically handles loading states.
 * Eliminates complex loading state management in WhatsNewModal.
 */

import type React from "react";
import { Suspense } from "react";
import { motion } from "motion/react";
import { fetchReleaseDataSuspense } from "@/services/releaseNotesService";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { open } from "@tauri-apps/plugin-shell";

interface ReleaseNotesContentProps {
	appVersion: string;
	onRetry?: () => void;
}

/**
 * Internal component that uses Suspense-compatible fetch
 */
function ReleaseNotesContent({
	appVersion,
	onRetry,
}: ReleaseNotesContentProps) {
	// This will throw a promise if fetch is loading (Suspense will catch it)
	const release = fetchReleaseDataSuspense();

	const handleOpenInGitHub = async () => {
		if (release?.html_url) {
			try {
				await open(release.html_url);
			} catch (error) {
				console.error("Failed to open URL:", error);
				window.open(release.html_url, "_blank");
			}
		}
	};

	const formatDate = (dateString: string) => {
		try {
			return new Date(dateString).toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});
		} catch {
			return dateString;
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="space-y-4"
		>
			<div className="flex items-center justify-between border-b pb-3">
				<div>
					<h3 className="text-lg font-semibold">{release.name}</h3>
					<p className="text-sm text-muted-foreground">
						Released {formatDate(release.published_at)}
						{appVersion && ` • Current version: v${appVersion}`}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={handleOpenInGitHub}
					className="flex items-center gap-2"
				>
					<ExternalLink className="h-4 w-4" />
					View on GitHub
				</Button>
			</div>

			<div className="prose prose-sm dark:prose-invert max-w-none">
				<MarkdownRenderer content={release.body} />
			</div>
		</motion.div>
	);
}

/**
 * Loading skeleton for release notes
 */
function ReleaseNotesLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between border-b pb-3">
				<div className="space-y-2">
					<div className="h-6 bg-muted rounded w-48 animate-pulse" />
					<div className="h-4 bg-muted rounded w-32 animate-pulse" />
				</div>
				<div className="h-8 bg-muted rounded w-24 animate-pulse" />
			</div>
			<div className="space-y-3">
				<div className="h-4 bg-muted rounded w-full animate-pulse" />
				<div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
				<div className="h-4 bg-muted rounded w-5/6 animate-pulse" />
				<div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
				<div className="h-4 bg-muted rounded w-4/5 animate-pulse" />
			</div>
		</div>
	);
}

/**
 * Error fallback for release notes
 */
function ReleaseNotesError({
	onRetry,
	error,
}: {
	onRetry?: () => void;
	error?: Error;
}) {
	return (
		<div className="text-center space-y-4 py-8">
			<div className="text-muted-foreground">
				<h3 className="font-medium mb-2">Failed to load release notes</h3>
				<p className="text-sm">
					{error?.message ||
						"Please check your internet connection or try again later."}
				</p>
			</div>
			{onRetry && (
				<Button onClick={onRetry} variant="outline" size="sm">
					Try Again
				</Button>
			)}
		</div>
	);
}

/**
 * Suspense-wrapped release notes component
 */
export const ReleaseNotesSuspense: React.FC<ReleaseNotesContentProps> = (
	props,
) => {
	return (
		<Suspense fallback={<ReleaseNotesLoading />}>
			<ReleaseNotesContent {...props} />
		</Suspense>
	);
};
