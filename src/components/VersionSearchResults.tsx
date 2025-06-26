/**
 * @fileoverview VersionSearchResults.tsx
 * Suspense-based search results component that automatically handles loading states.
 * Provides instant search results with automatic loading coordination.
 */

import React, { Suspense } from "react";
import { motion } from "motion/react";
import { searchVersionsSuspense } from "@/services/versionSearchService";
import { useProjectStore } from "@/store/projectStore";
import type { AssetVersion } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  searchTerm: string;
  selectedVersions: AssetVersion[];
  currentVersionIds: Set<string>;
  isMultiSelectMode: boolean;
  onVersionClick: (version: AssetVersion, isCheckbox: boolean) => void;
}

/**
 * Internal component that uses Suspense-compatible search
 */
function SearchResults({
  searchTerm,
  selectedVersions,
  currentVersionIds,
  isMultiSelectMode,
  onVersionClick,
}: SearchResultsProps) {
  const { selectedProjectId } = useProjectStore();
  
  // This will throw a promise if search is loading (Suspense will catch it)
  const results = searchVersionsSuspense({
    searchTerm,
    projectId: selectedProjectId || undefined,
  });

  if (results.length === 0) {
    const isMultiVersionSearch = searchTerm.includes(",");
    return (
      <div className="text-center py-2 text-sm text-zinc-500 dark:text-zinc-400">
        {isMultiVersionSearch
          ? `No results found for ${searchTerm.split(",").length} searched version(s)`
          : "No results found"}
      </div>
    );
  }

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
      className="grid grid-cols-4 xl:grid-cols-5 gap-1.5 max-h-[300px] overflow-y-auto"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {results.map((version) => {
        const isInPlaylist = currentVersionIds.has(version.id);
        const isSelected = selectedVersions.some((v) => v.id === version.id);

        return (
          <motion.div
            key={version.id}
            className={`border rounded p-1.5 cursor-pointer bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs relative group transition-colors ${
              isInPlaylist
                ? "opacity-50 bg-zinc-100 dark:bg-zinc-700 cursor-not-allowed"
                : ""
            } ${
              isSelected
                ? "border-purple-500 dark:border-purple-500"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
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
                  onVersionClick(version, true);
                }}
              >
                <Checkbox checked={isSelected} />
              </div>
            )}

            {/* Version content */}
            <div
              onClick={() =>
                !isInPlaylist && onVersionClick(version, false)
              }
              className="w-full h-full"
            >
              <div className="font-medium truncate max-w-[90%] text-zinc-900 dark:text-zinc-200">
                {version.name}
              </div>
              <div className="text-zinc-500 dark:text-zinc-400">
                v{version.version}
                {version.user ? ` - ${version.user.firstName}` : ""}
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/**
 * Loading skeleton for search results
 */
function SearchResultsSkeleton() {
  return (
    <div className="flex items-center justify-center h-[300px] text-center py-2 text-lg text-zinc-500 dark:text-zinc-400">
      Loading...
    </div>
  );
}

/**
 * Suspense-wrapped search results component
 */
export const VersionSearchResults: React.FC<SearchResultsProps> = (props) => {
  // Don't render anything if no search term
  if (!props.searchTerm.trim()) {
    return null;
  }

  return (
    <Suspense fallback={<SearchResultsSkeleton />}>
      <SearchResults {...props} />
    </Suspense>
  );
}; 