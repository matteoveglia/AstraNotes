/**
 * @fileoverview RelatedVersionsGrid.tsx
 * Grid layout component for displaying related versions.
 * Features responsive grid layout, loading states, and empty states.
 * @component
 */

import React from "react";
import { AssetVersion } from "@/types";
import { RelatedVersionItem } from "./RelatedVersionItem";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface RelatedVersionsGridProps {
  versions: AssetVersion[];
  selectedVersionIds: Set<string>;
  onVersionToggle: (version: AssetVersion) => void;
  loading?: boolean;
  className?: string;
}

export const RelatedVersionsGrid: React.FC<RelatedVersionsGridProps> = ({
  versions,
  selectedVersionIds,
  onVersionToggle,
  loading = false,
  className,
}) => {
  const handleVersionToggle = (version: AssetVersion) => {
    onVersionToggle(version);
  };

  const handleThumbnailClick = (version: AssetVersion) => {
    console.debug("[RelatedVersionsGrid] Thumbnail clicked for version:", version.name);
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 animate-pulse"
            >
              {/* Thumbnail skeleton */}
              <div className="w-full h-32 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
              
              {/* Content skeleton */}
              <div className="space-y-2">
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
                <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
                <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <div className="text-center">
          <div className="text-zinc-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2M7 4h10M7 4L6 20a1 1 0 001 1h10a1 1 0 001-1L17 4M9 9v6M15 9v6" />
            </svg>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 mb-1">No versions found</p>
          <p className="text-sm text-zinc-500">Try adjusting your search or filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Grid container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {versions.map((version, index) => (
            <motion.div
              key={version.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, delay: index * 0.02 }}
            >
              <RelatedVersionItem
                version={version}
                isSelected={selectedVersionIds.has(version.id)}
                onToggleSelection={handleVersionToggle}
                onThumbnailClick={handleThumbnailClick}
                viewMode="grid"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Grid summary */}
      <div className="text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Showing {versions.length} version{versions.length === 1 ? '' : 's'}
          {selectedVersionIds.size > 0 && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              • {selectedVersionIds.size} selected
            </span>
          )}
        </p>
      </div>
    </div>
  );
}; 