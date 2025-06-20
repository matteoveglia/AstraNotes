/**
 * @fileoverview VersionSearch.tsx
 * Search component for version discovery and addition with multi-select capability.
 * Features debounced search, thumbnails, version selection (single or multiple),
 * clear functionality, loading states, and disabling of versions already in playlist.
 */

import React, { useState, useCallback, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useDebounce } from "../hooks/useDebounce";
import { AssetVersion, Playlist } from "@/types";
import { ftrackService } from "../services/ftrack";
import { useProjectStore } from "../store/projectStore";
import { Checkbox } from "./ui/checkbox";
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
  const [results, setResults] = useState<AssetVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<AssetVersion[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isMultiVersionSearch, setIsMultiVersionSearch] = useState(false);

  // PROJECT FILTERING FIX: Get selected project ID for search filtering
  const { selectedProjectId } = useProjectStore();

  // Create a Set of current version IDs for efficient lookup
  const currentVersionIds = new Set(currentVersions.map((v) => v.id));

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

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

    setSearchTerm(normalizedTerm);

    if (normalizedTerm === "") {
      handleClearSelection(); // Clear any selected versions when search term is also cleared
    }
  };

  const handleSearch = useCallback(async () => {
    if (!debouncedSearchTerm) {
      setResults([]);
      setIsMultiVersionSearch(false);
      return;
    }

    setIsLoading(true);
    try {
      // Check if this is a comma-separated multi-version search
      if (debouncedSearchTerm.includes(",")) {
        setIsMultiVersionSearch(true);
        const versionTerms = debouncedSearchTerm
          .split(",")
          .map((term) => term.trim())
          .filter((term) => term.length > 0);

        // Search for each version term individually with project filtering
        const searchPromises = versionTerms.map((term) =>
          ftrackService.searchVersions({
            searchTerm: term,
            projectId: selectedProjectId,
          }),
        );

        const searchResults = await Promise.all(searchPromises);

        // Combine and deduplicate results
        const combinedResults = searchResults.flat();
        const uniqueResults = combinedResults.filter(
          (version, index, self) =>
            index === self.findIndex((v) => v.id === version.id),
        );

        setResults(uniqueResults);
      } else {
        // Regular single search with project filtering
        setIsMultiVersionSearch(false);
        const versions = await ftrackService.searchVersions({
          searchTerm: debouncedSearchTerm,
          projectId: selectedProjectId,
        });
        setResults(versions);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchTerm, selectedProjectId]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

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
        setResults([]);
      }
    }
  };

  const handleAddSelected = () => {
    if (selectedVersions.length > 0) {
      onVersionsSelect(selectedVersions);
      setSelectedVersions([]);
      setIsMultiSelectMode(false);
      setSearchTerm("");
      setResults([]);
    }
  };

  const handleClearSelection = () => {
    setSelectedVersions([]);
    setIsMultiSelectMode(false);
  };

  const gridVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: { duration: 0.2 },
    },
    transition: {
      type: "spring",
      duration: 0.6,
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 1 }}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={
              isMultiVersionSearch
                ? "Multi-version search active (comma-separated)"
                : "Search by asset name or version (e.g. 'shot_010' or 'v2')"
            }
            value={searchTerm}
            onChange={handleSearchTermChange}
            className="flex-1"
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
            Multi-version search: {debouncedSearchTerm.split(",").length}{" "}
            version(s) being searched
          </motion.div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-[300px] text-center py-2 text-lg text-zinc-500">
            Loading...
          </div>
        ) : results.length > 0 ? (
          <motion.div
            className="grid grid-cols-4 xl:grid-cols-5 gap-1.5 max-h-[300px] overflow-y-auto"
            variants={gridVariants}
            initial="hidden"
            animate="visible"
          >
            {results.map((version) => {
              // Check if this version is already in the playlist
              const isInPlaylist = currentVersionIds.has(version.id);
              const isSelected = selectedVersions.some(
                (v) => v.id === version.id,
              );

              return (
                <motion.div
                  key={version.id}
                  className={`border rounded p-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs relative group ${
                    isInPlaylist
                      ? "opacity-50 bg-zinc-100 cursor-not-allowed"
                      : ""
                  } ${isSelected ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""}`}
                  variants={itemVariants}
                >
                  {/* Checkbox for multi-select, visible on hover or when selected */}
                  {!isInPlaylist && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 right-2 z-10 ${
                        isSelected || isMultiSelectMode
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      } transition-opacity`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVersionClick(version, true);
                      }}
                    >
                      <Checkbox checked={isSelected} />
                    </div>
                  )}

                  {/* Version content */}
                  <div
                    onClick={() =>
                      !isInPlaylist && handleVersionClick(version, false)
                    }
                    className="w-full h-full"
                  >
                    {version.thumbnailUrl && (
                      <img
                        src={version.thumbnailUrl}
                        alt={version.name}
                        className="w-full h-16 object-cover mb-1"
                      />
                    )}
                    <div className="font-medium truncate max-w-[90%]">
                      {version.name}
                    </div>
                    <div className="text-zinc-500">v{version.version}</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : debouncedSearchTerm ? (
          <div className="text-center py-2 text-sm text-zinc-500">
            {isMultiVersionSearch
              ? `No results found for ${debouncedSearchTerm.split(",").length} searched version(s)`
              : "No results found"}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};
