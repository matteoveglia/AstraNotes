/**
 * @fileoverview RelatedVersionsList.tsx
 * List/table layout component for displaying related versions.
 * Features sortable columns, loading states, and responsive design.
 * @component
 */

import React, { useState } from "react";
import { AssetVersion } from "@/types";
import { RelatedVersionItem } from "./RelatedVersionItem";
import { motion, AnimatePresence } from "motion/react";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { VersionStatus } from "@/services/relatedVersionsService";

interface RelatedVersionsListProps {
  versions: AssetVersion[];
  selectedVersionIds: Set<string>;
  onVersionToggle: (version: AssetVersion) => void;
  onSelectAll?: () => void;
  versionDataCache?: {
    details: Record<string, any>;
    statuses: Record<string, any>;
  };
  availableStatuses?: VersionStatus[];
  onStatusUpdate?: (versionId: string, newStatusId: string) => void;
  loading?: boolean;
  className?: string;
}

type SortField = 'name' | 'version' | 'publishedBy' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

export const RelatedVersionsList: React.FC<RelatedVersionsListProps> = ({
  versions,
  selectedVersionIds,
  onVersionToggle,
  onSelectAll,
  versionDataCache,
  availableStatuses,
  onStatusUpdate,
  loading = false,
  className,
}) => {
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <Minus className="w-3 h-3 text-zinc-400" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3 text-zinc-600 dark:text-zinc-300" /> : 
      <ChevronDown className="w-3 h-3 text-zinc-600 dark:text-zinc-300" />;
  };

  const sortedVersions = React.useMemo(() => {
    if (!versions.length) return versions;

    return [...versions].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'version':
          aValue = a.version;
          bValue = b.version;
          break;
        case 'publishedBy':
          aValue = (a.user?.username || '').toLowerCase();
          bValue = (b.user?.username || '').toLowerCase();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [versions, sortField, sortDirection]);

  const allSelected = versions.length > 0 && versions.every(v => selectedVersionIds.has(v.id));
  const someSelected = versions.some(v => selectedVersionIds.has(v.id));

  const handleSelectAllToggle = () => {
    onSelectAll?.();
  };

  const SortableHeader: React.FC<{ field: SortField; children: React.ReactNode; className?: string }> = ({ 
    field, 
    children, 
    className 
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-auto px-2 py-0 justify-start font-medium text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100", className)}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {getSortIcon(field)}
      </span>
    </Button>
  );

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
            <div className="w-24 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-32 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-32 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
            <div className="w-24 h-3 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
          
          {/* Rows skeleton */}
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-3 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0">
              <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-16 h-12 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="flex-1">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 animate-pulse" />
              </div>
              <div className="w-20 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-24 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              <div className="w-32 h-3 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
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
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6M9 8h6M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden"
      >
        {/* Table Header */}
        <div className="flex items-center gap-4 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex-shrink-0">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={handleSelectAllToggle}
              aria-label="Select all versions"
            />
          </div>
          
          <div className="flex-shrink-0 w-16 flex items-center">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2">Preview</span>
          </div>
          
          <div className="flex-1 min-w-0 flex items-center">
            <SortableHeader field="name">Asset Name</SortableHeader>
          </div>
          
          <div className="flex-shrink-0 w-20 flex items-center">
            <SortableHeader field="version">Version</SortableHeader>
          </div>
          
          <div className="flex-shrink-0 w-24 flex items-center">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2">Shot Status</span>
          </div>
          
          <div className="flex-shrink-0 w-32 flex items-center">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 px-2">Version Status</span>
          </div>
          
          <div className="flex-shrink-0 w-32 flex items-center">
            <SortableHeader field="publishedBy">Published By</SortableHeader>
          </div>
          
          <div className="flex-shrink-0 w-24 flex items-center">
            <SortableHeader field="updatedAt">Date</SortableHeader>
          </div>
        </div>

        {/* Table Body */}
        <AnimatePresence mode="popLayout">
          {sortedVersions.map((version, index) => (
            <motion.div
              key={version.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <RelatedVersionItem
                version={version}
                isSelected={selectedVersionIds.has(version.id)}
                onToggleSelection={onVersionToggle}
                versionDataCache={versionDataCache}
                availableStatuses={availableStatuses}
                onStatusUpdate={onStatusUpdate}
                viewMode="list"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* List summary */}
      <div className="text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Showing {versions.length} version{versions.length === 1 ? '' : 's'}
          {selectedVersionIds.size > 0 && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              • {selectedVersionIds.size} selected
            </span>
          )}
          {sortField && (
            <span className="ml-2 text-zinc-400">
              • Sorted by {sortField} ({sortDirection})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}; 