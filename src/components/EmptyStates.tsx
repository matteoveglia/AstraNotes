/**
 * @fileoverview EmptyStates.tsx
 * Empty state components for when no project is selected.
 * Provides visual guidance to users about next steps.
 * @component
 */

import type React from "react";
import { Folder, ArrowUp } from "lucide-react";

/** Empty state for main content when no project is selected */
export const NoProjectSelectedState: React.FC = () => (
	<div className="h-full flex flex-col items-center justify-center p-8 text-center select-none">
		<div className="mb-4 p-3 rounded-full bg-blue-50 dark:bg-blue-900/20">
			<Folder className="w-8 h-8 text-blue-600 dark:text-blue-400" />
		</div>
		<h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
			Select a Project
		</h3>
		<p className="text-zinc-600 dark:text-zinc-400 mb-4 max-w-md">
			Choose a project from the dropdown above to view its playlists and start
			taking notes.
		</p>
		<div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
			<ArrowUp className="w-4 h-4" />
			<span>Select project in the top bar</span>
		</div>
	</div>
);

/** Empty state for playlist panel when no project is selected */
export const PlaylistPanelEmptyState: React.FC = () => (
	<div className="flex flex-col items-center justify-center p-6 text-center min-h-[200px] select-none">
		<div className="mb-3 p-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
			<ArrowUp className="w-6 h-6 text-zinc-400" />
		</div>
		<p className="text-sm text-zinc-600 dark:text-zinc-400">
			Select a project above to view playlists
		</p>
	</div>
);
