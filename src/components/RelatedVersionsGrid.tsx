/**
 * @fileoverview RelatedVersionsGrid.tsx
 * Grid layout component for displaying related versions.
 * Features responsive grid layout, loading states, and empty states.
 * @component
 */

import React from "react";
import { AssetVersion } from "@/types";
import { RelatedVersionItem } from "./RelatedVersionItem";
// Animation imports removed as per Phase 4.4 - no per-item animations
import { cn } from "@/lib/utils";
import { VersionStatus, ShotStatus } from "@/services/relatedVersionsService";

interface RelatedVersionsGridProps {
  versions: AssetVersion[];
  selectedVersionIds: Set<string>;
  onVersionToggle: (version: AssetVersion) => void;
  versionDataCache?: {
    details: Record<string, any>;
    statuses: Record<string, any>;
    shotStatuses: Record<string, any>;
  };
  availableStatuses?: VersionStatus[];
  availableShotStatuses?: ShotStatus[];
  onStatusUpdate?: (versionId: string, newStatusId: string) => void;
  onShotStatusUpdate?: (versionId: string, newStatusId: string) => void;
  loading?: boolean;
  className?: string;
}

export const RelatedVersionsGrid: React.FC<RelatedVersionsGridProps> = ({
  versions,
  selectedVersionIds,
  onVersionToggle,
  versionDataCache,
  availableStatuses,
  availableShotStatuses,
  onStatusUpdate,
  onShotStatusUpdate,
  loading = false,
  className,
}) => {
  // Consistent grid layout classes
  const gridClasses =
    "grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4";

  const handleVersionToggle = (version: AssetVersion) => {
    onVersionToggle(version);
  };

  const handleThumbnailClick = (version: AssetVersion) => {
    console.debug(
      "[RelatedVersionsGrid] Thumbnail clicked for version:",
      version.name,
    );
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Grid skeleton - updated to match new layout */}
        <div className={gridClasses}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden animate-pulse min-w-[280px]"
            >
              {/* Header skeleton - matching new layout */}
              <div className="p-3 pb-2">
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 mb-1" />
                <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4" />
              </div>

              {/* Content skeleton - thumbnail | data columns */}
              <div className="flex gap-3 p-3 pt-0">
                {/* Thumbnail skeleton */}
                <div className="flex-shrink-0 w-24 bg-zinc-200 dark:bg-zinc-700 rounded self-stretch" />

                {/* Data skeleton */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-8" />
                    <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-10 text-right" />
                    <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-10 text-right" />
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-10 text-right" />
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded flex-1" />
                  </div>
                </div>
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
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2M7 4h10M7 4L6 20a1 1 0 001 1h10a1 1 0 001-1L17 4M9 9v6M15 9v6"
              />
            </svg>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 mb-1">
            No versions found
          </p>
          <p className="text-sm text-zinc-500">
            Try adjusting your search or filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Grid container - updated for better responsive behavior with 280px minimum width */}
      <div className={gridClasses}>
        {versions.map((version) => (
          <RelatedVersionItem
            key={version.id}
            version={version}
            isSelected={selectedVersionIds.has(version.id)}
            onToggleSelection={handleVersionToggle}
            onThumbnailClick={handleThumbnailClick}
            versionDataCache={versionDataCache}
            availableStatuses={availableStatuses}
            availableShotStatuses={availableShotStatuses}
            onStatusUpdate={onStatusUpdate}
            onShotStatusUpdate={onShotStatusUpdate}
            viewMode="grid"
          />
        ))}
      </div>

      {/* Selection summary (no versions count, handled by modal footer) */}
      {selectedVersionIds.size > 0 && (
        <div className="text-center">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {selectedVersionIds.size} selected
          </p>
        </div>
      )}
    </div>
  );
};
