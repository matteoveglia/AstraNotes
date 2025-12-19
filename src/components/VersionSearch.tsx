/**
 * @fileoverview VersionSearch.tsx
 * Search component for version discovery and addition with multi-select capability.
 * Features immediate input response with deferred search, thumbnails, version selection (single or multiple),
 * clear functionality, loading states, and disabling of versions already in playlist.
 */

import type React from "react";
import { useState, useDeferredValue } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import type { AssetVersion, Playlist } from "@/types";
import { Checkbox } from "./ui/checkbox";
import { VersionSearchResults } from "./VersionSearchResults";
import { motion } from "motion/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { QuickNotesToPlaylistButton } from "@/features/notes/components/QuickNotesToPlaylistButton";

interface VersionSearchProps {
	onVersionSelect: (version: AssetVersion) => void;
	onVersionsSelect: (versions: AssetVersion[]) => void;
	onClearAdded: () => void;
	hasManuallyAddedVersions?: boolean;
	isQuickNotes?: boolean;
	currentVersions?: AssetVersion[]; // Current versions in the playlist
	onPlaylistCreated?: (playlist: Playlist) => void;
}

export const VersionSearch: React.FC<VersionSearchProps> = ({
	onVersionSelect,
	onVersionsSelect,
	onClearAdded,
	hasManuallyAddedVersions = false,
	isQuickNotes = false,
	currentVersions = [],
	onPlaylistCreated,
}) => {
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedVersions, setSelectedVersions] = useState<AssetVersion[]>([]);
	const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
	const [isMultiVersionSearch, setIsMultiVersionSearch] = useState(false);

	// Create a Set of current version IDs for efficient lookup
	const currentVersionIds = new Set(currentVersions.map((v) => v.id));

	// Use useDeferredValue for non-urgent search operations
	// This allows immediate input response while deferring expensive search operations
	const deferredSearchTerm = useDeferredValue(searchTerm);

	// Function to detect if the search term contains multiple version names
	const detectMultipleVersions = (term: string): boolean => {
		// Look for patterns like "something_v0001" or "something_v001" etc.
		const versionPattern = /\w+_v\d+/g;
		const matches = term.match(versionPattern);
		return matches !== null && matches.length > 1;
	};

	// Function to normalize multi-version search terms
	const normalizeMultiVersionSearch = (term: string): string => {
		if (detectMultipleVersions(term)) {
			// Replace multiple spaces with single spaces, then convert to comma-separated
			return term.replace(/\s+/g, " ").replace(/\s/g, ", ");
		}
		return term;
	};

	const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newSearchTerm = e.target.value;

		// Check if this looks like a multi-version search
		const isMultiVersion = detectMultipleVersions(newSearchTerm);
		setIsMultiVersionSearch(isMultiVersion);

		// If it's a multi-version search, normalize it
		const normalizedTerm = isMultiVersion
			? normalizeMultiVersionSearch(newSearchTerm)
			: newSearchTerm;

		// Set search term immediately for responsive input
		setSearchTerm(normalizedTerm);

		if (normalizedTerm === "") {
			handleClearSelection(); // Clear any selected versions when search term is also cleared
		}
	};

	// Search logic is now handled by VersionSearchResults component with Suspense

	const handleClearVersions = () => {
		onClearAdded();
	};

	const handleVersionClick = (version: AssetVersion, isCheckbox: boolean) => {
		// Check if version is already in the playlist
		if (currentVersionIds.has(version.id)) {
			return; // Do nothing if version is already in the playlist
		}

		if (isCheckbox) {
			// Checkbox click - toggle multi-select mode
			setIsMultiSelectMode(true);

			// Toggle version in selected versions
			setSelectedVersions((prev) => {
				// Check if this version is already selected
				const isSelected = prev.some((v) => v.id === version.id);

				if (isSelected) {
					// Remove from selection
					const newSelected = prev.filter((v) => v.id !== version.id);
					// If no more selections, exit multi-select mode
					if (newSelected.length === 0) {
						setIsMultiSelectMode(false);
					}
					return newSelected;
				} else {
					// Add to selection
					return [...prev, version];
				}
			});
		} else {
			// Regular click
			if (isMultiSelectMode) {
				// In multi-select mode, toggle selection
				setSelectedVersions((prev) => {
					const isSelected = prev.some((v) => v.id === version.id);

					if (isSelected) {
						// Remove from selection
						const newSelected = prev.filter((v) => v.id !== version.id);
						// If no more selections, exit multi-select mode
						if (newSelected.length === 0) {
							setIsMultiSelectMode(false);
						}
						return newSelected;
					} else {
						// Add to selection
						return [...prev, version];
					}
				});
			} else {
				// Normal mode - select single version and reset search
				onVersionSelect(version);
				setSearchTerm("");
			}
		}
	};

	const handleAddSelected = () => {
		if (selectedVersions.length > 0) {
			onVersionsSelect(selectedVersions);
			setSelectedVersions([]);
			setIsMultiSelectMode(false);
			setSearchTerm("");
		}
	};

	const handleClearSelection = () => {
		setSelectedVersions([]);
		setIsMultiSelectMode(false);
	};

	// Animation variants moved to VersionSearchResults component

	return (
		<motion.div
			initial={{ opacity: 0, y: 0 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", duration: 1 }}
		>
			<div className="space-y-2">
				<div className="flex gap-2">
					<Input
						placeholder={
							isMultiVersionSearch
								? "Multi-version search active (comma-separated)"
								: "Search by asset name or version (e.g. 'shot_010' or 'v2')"
						}
						value={searchTerm}
						onChange={handleSearchTermChange}
						className="flex-1 h-8"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
					/>
					<div className="flex items-center gap-2">
						{selectedVersions.length > 0 && (
							<>
								<motion.div
									initial={{ opacity: 0, scale: 0.7 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ type: "spring", duration: 0.4 }}
									exit={{ opacity: 0, scale: 0.7 }}
								>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="default"
													size="sm"
													onClick={handleAddSelected}
												>
													Add {selectedVersions.length} Selected
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												<ul className="list-disc pl-4 text-sm">
													{selectedVersions.map((v) => (
														<li key={`${v.name}-${v.version}`}>
															{v.name} - v{v.version}
														</li>
													))}
												</ul>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</motion.div>
								<motion.div
									initial={{ opacity: 0, scale: 0.7 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ type: "spring", duration: 0.4, delay: 0.1 }}
									exit={{ opacity: 0, scale: 0.7 }}
								>
									<Button
										variant="outline"
										size="sm"
										onClick={handleClearSelection}
									>
										Clear Selection
									</Button>
								</motion.div>
							</>
						)}
						<motion.div
							initial={{ opacity: 0, scale: 0.7 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ type: "spring", duration: 0.4, delay: 0.2 }}
							exit={{ opacity: 0, scale: 0.7 }}
						>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											onClick={handleClearVersions}
											disabled={!hasManuallyAddedVersions}
										>
											Clear Added Versions
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<ul className="list-disc pl-4 text-sm">
											{currentVersions
												.filter((v) => v.manuallyAdded)
												.map((v) => (
													<li key={`${v.name}-${v.version}`}>
														{v.name} - v{v.version}
													</li>
												))}
										</ul>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</motion.div>
						{/* Quick Notes to Playlist Button */}
						{isQuickNotes &&
							currentVersions.length > 0 &&
							onPlaylistCreated && (
								<motion.div
									initial={{ opacity: 0, scale: 0.7 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ type: "spring", duration: 0.4, delay: 0.3 }}
									exit={{ opacity: 0, scale: 0.7 }}
								>
									<QuickNotesToPlaylistButton
										versions={currentVersions}
										onSuccess={onPlaylistCreated}
									/>
								</motion.div>
							)}
					</div>
				</div>

				{isMultiVersionSearch && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400"
					>
						<div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
						Multi-version search: {deferredSearchTerm.split(",").length}{" "}
						version(s) being searched
					</motion.div>
				)}

				<VersionSearchResults
					searchTerm={deferredSearchTerm}
					selectedVersions={selectedVersions}
					currentVersionIds={currentVersionIds}
					isMultiSelectMode={isMultiSelectMode}
					onVersionClick={handleVersionClick}
				/>
			</div>
		</motion.div>
	);
};
