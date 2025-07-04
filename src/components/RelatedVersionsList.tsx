/**
 * @fileoverview RelatedVersionsList.tsx
 * List/table layout component for displaying related versions.
 * Features sortable columns, loading states, and responsive design.
 * @component
 */

import React, { useState, useEffect } from "react";
import { AssetVersion } from "@/types";
import { RelatedVersionItem } from "./RelatedVersionItem";
// Animation imports removed as per Phase 4.4 - no per-item animations
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { VersionStatus, ShotStatus } from "@/services/relatedVersionsService";

interface RelatedVersionsListProps {
  versions: AssetVersion[];
  selectedVersionIds: Set<string>;
  onVersionToggle: (version: AssetVersion) => void;
  onSelectAll?: () => void;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
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
  /**
   * Optional external sort information controlled by the parent (RelatedVersionsModal).
   * When provided, the internal sortField / sortDirection will be synced
   * to stay consistent with the parent-level sort dropdown (Phase 6.2).
   */
  sortInfo?: { field: SortField; direction: SortDirection };
}

type SortField = "name" | "version" | "publishedBy" | "updatedAt";
type SortDirection = "asc" | "desc";

// Column width classes shared by both the table header and each list row. Keeping these as
// constants guarantees that any future tweaks remain in sync and prevents subtle drift that
// can occur if header / body cells diverge.
const COL_WIDTH = {
  checkbox: "flex-shrink-0", // checkbox keeps natural width
  preview: "flex-shrink-0 w-16", // 64 px thumbnail preview
  name: "flex-1 min-w-0", // grows to fill remaining space
  version: "flex-shrink-0 w-20", // ~80 px
  shotStatus: "flex-shrink-0 w-28", // ~112 px
  versionStatus: "flex-shrink-0 w-36", // ~144 px
  publishedBy: "flex-shrink-0 w-32", // ~128 px
  date: "flex-shrink-0 w-24", // ~96 px
} as const;

export const RelatedVersionsList: React.FC<RelatedVersionsListProps> = ({
  versions,
  selectedVersionIds,
  onVersionToggle,
  onSelectAll,
  onSortChange,
  versionDataCache,
  availableStatuses,
  availableShotStatuses,
  onStatusUpdate,
  onShotStatusUpdate,
  loading = false,
  className,
  sortInfo,
}) => {
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Keep internal sort state in sync with any externally controlled sortInfo.
  useEffect(() => {
    if (!sortInfo) return;

    if (sortInfo.field !== sortField) {
      setSortField(sortInfo.field as SortField);
    }

    if (sortInfo.direction !== sortDirection) {
      setSortDirection(sortInfo.direction as SortDirection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortInfo]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      onSortChange?.(field, sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
      onSortChange?.(field, "asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <Minus className="w-3 h-3 text-zinc-400" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 text-zinc-600 dark:text-zinc-300" />
    ) : (
      <ChevronDown className="w-3 h-3 text-zinc-600 dark:text-zinc-300" />
    );
  };

  const sortedVersions = React.useMemo(() => {
    if (!versions.length) return versions;

    return [...versions].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "version":
          aValue = a.version;
          bValue = b.version;
          break;
        case "publishedBy":
          aValue = (a.user?.username || "").toLowerCase();
          bValue = (b.user?.username || "").toLowerCase();
          break;
        case "updatedAt":
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [versions, sortField, sortDirection]);

  const allSelected =
    versions.length > 0 && versions.every((v) => selectedVersionIds.has(v.id));
  const someSelected = versions.some((v) => selectedVersionIds.has(v.id));

  const handleSelectAllToggle = () => {
    onSelectAll?.();
  };

  const SortableHeader: React.FC<{
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }> = ({ field, children, className }) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-auto px-0 py-0 justify-start font-medium text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100",
        className,
      )}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {getSortIcon(field)}
      </span>
    </Button>
  );

  // Notify parent when this component is controlling sort (i.e., sortInfo not provided)
  useEffect(() => {
    if (sortInfo) return; // controlled externally – avoid feedback loop
    onSortChange?.(sortField, sortDirection);
  }, [onSortChange, sortField, sortDirection, sortInfo]);

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {/* Header skeleton */}
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg">
          <div className="flex items-center gap-4 p-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
            <div className="w-4 h-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-16 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="flex-1 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-20 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-28 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-36 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-32 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-24 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>

          {/* Rows skeleton */}
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
            >
              <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-16 h-12 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="flex-1">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 animate-pulse" />
              </div>
              <div className="w-20 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-28 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-36 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-32 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-24 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
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
                d="M9 12h6M9 16h6M9 8h6M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
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
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center gap-4 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex-shrink-0">
            <Checkbox
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={handleSelectAllToggle}
              aria-label="Select all versions"
            />
          </div>

          <div className={cn(COL_WIDTH.preview, "flex items-center")}>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 select-none">
              Preview
            </span>
          </div>

          <div className={cn(COL_WIDTH.name, "flex items-center")}>
            <SortableHeader field="name">Asset Name</SortableHeader>
          </div>

          <div className={cn(COL_WIDTH.version, "flex items-center")}>
            <SortableHeader field="version">Version</SortableHeader>
          </div>

          <div className={cn(COL_WIDTH.shotStatus, "flex items-center")}>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2">
              Shot Status
            </span>
          </div>

          <div className={cn(COL_WIDTH.versionStatus, "flex items-center")}>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2">
              Version
            </span>
          </div>

          <div className={cn(COL_WIDTH.publishedBy, "flex items-center")}>
            <SortableHeader field="publishedBy">Published By</SortableHeader>
          </div>

          <div className={cn(COL_WIDTH.date, "flex items-center")}>
            <SortableHeader field="updatedAt">Date</SortableHeader>
          </div>
        </div>

        {/* Table Body */}
        <div>
          {sortedVersions.map((version) => (
            <RelatedVersionItem
              key={version.id}
              version={version}
              isSelected={selectedVersionIds.has(version.id)}
              onToggleSelection={onVersionToggle}
              versionDataCache={versionDataCache}
              availableStatuses={availableStatuses}
              availableShotStatuses={availableShotStatuses}
              onStatusUpdate={onStatusUpdate}
              onShotStatusUpdate={onShotStatusUpdate}
              viewMode="list"
            />
          ))}
        </div>
      </div>

      {/* Selection summary (no versions count/sort info; handled in modal footer) */}
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
