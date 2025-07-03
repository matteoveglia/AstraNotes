/**
 * @fileoverview RelatedVersionItem.tsx
 * Individual version display component shared between grid and list views.
 * Features thumbnail display, version details, selection state, and loading states.
 * @component
 */

import React, { useState } from "react";
import { AssetVersion } from "@/types";
import { ThumbnailSuspense } from "./ui/ThumbnailSuspense";
import { ThumbnailModal } from "./ThumbnailModal";
import { BorderTrail } from "@/components/ui/border-trail";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { VersionStatus, ShotStatus } from "@/services/relatedVersionsService";
import { StatusSelector } from "./StatusSelector";

interface RelatedVersionItemProps {
  version: AssetVersion;
  isSelected: boolean;
  onToggleSelection: (version: AssetVersion) => void;
  onThumbnailClick?: (version: AssetVersion) => void;
  versionDataCache?: {
    details: Record<string, any>;
    statuses: Record<string, any>;
    shotStatuses: Record<string, any>;
  };
  availableStatuses?: VersionStatus[];
  availableShotStatuses?: ShotStatus[];
  onStatusUpdate?: (versionId: string, newStatusId: string) => void;
  onShotStatusUpdate?: (versionId: string, newStatusId: string) => void;
  viewMode: 'grid' | 'list';
  className?: string;
}

export const RelatedVersionItem: React.FC<RelatedVersionItemProps> = ({
  version,
  isSelected,
  onToggleSelection,
  onThumbnailClick,
  versionDataCache,
  availableStatuses = [],
  availableShotStatuses = [],
  onStatusUpdate,
  onShotStatusUpdate,
  viewMode,
  className,
}) => {
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [isModalOperationInProgress, setIsModalOperationInProgress] = useState(false);
  
  // Use cached data instead of fetching
  const versionDetails = versionDataCache?.details[version.id] || null;
  const versionStatus = versionDataCache?.statuses[version.id] || null;
  const shotStatus = versionDataCache?.shotStatuses[version.id] || null;
  const isLoadingDetails = !versionDataCache?.details[version.id];
  const isLoadingStatuses = !versionDataCache?.statuses[version.id];

  const handleThumbnailClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering item selection
    e.preventDefault(); // Prevent any default behavior
    setIsModalOperationInProgress(true);
    if (version.thumbnailId) {
      setIsThumbnailModalOpen(true);
    }
    onThumbnailClick?.(version);
  };

  const handleItemClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on thumbnail or checkbox, or if modal operation is in progress
    const target = e.target as HTMLElement;
    if (target.closest('[data-thumbnail]') || target.closest('[data-checkbox]') || isModalOperationInProgress) {
      return;
    }
    
    onToggleSelection(version);
  };

  const handleCheckboxChange = (_checked: boolean) => {
    if (isModalOperationInProgress) return;
    onToggleSelection(version);
  };

  const handleModalClose = () => {
    // Set flag to prevent any selection during modal close
    setIsModalOperationInProgress(true);
    
    // Use setTimeout to ensure modal close doesn't interfere with any potential parent events
    setTimeout(() => {
      setIsThumbnailModalOpen(false);
      // Reset the flag after a brief delay to allow modal close to complete
      setTimeout(() => {
        setIsModalOperationInProgress(false);
      }, 100);
    }, 0);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear().toString().slice(-2);
      return `${day} ${month} '${year}`;
    } catch {
      return dateString;
    }
  };

  if (viewMode === 'list') {
    // List view layout - table row style
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "flex items-center gap-4 p-3 border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors",
          isSelected && "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
          className
        )}
        onClick={handleItemClick}
      >
        {/* Checkbox */}
        <div data-checkbox className="flex-shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            aria-label={`Select ${version.name}`}
          />
        </div>

        {/* Thumbnail */}
        <div 
          data-thumbnail
          className="flex-shrink-0 w-16 h-12 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden cursor-pointer"
          onClick={handleThumbnailClick}
        >
          <ThumbnailSuspense
            thumbnailId={version.thumbnailId}
            alt={version.name}
            className="w-full h-full object-cover"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              </div>
            }
          />
        </div>

        {/* Asset Name */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{version.name}</div>
        </div>

        {/* Version */}
        <div className="flex-shrink-0 w-20">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">v{version.version}</div>
        </div>

        {/* Shot Status */}
        <div className="flex-shrink-0 w-24">
          {isLoadingStatuses ? (
            <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : (
            <StatusSelector
              versionId={version.id}
              currentStatus={shotStatus}
              availableStatuses={availableShotStatuses}
              onStatusUpdate={onShotStatusUpdate}
            />
          )}
        </div>

        {/* Version Status */}
        <div className="flex-shrink-0 w-32">
          {isLoadingStatuses ? (
            <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : (
            <StatusSelector
              versionId={version.id}
              currentStatus={versionStatus}
              availableStatuses={availableStatuses}
              onStatusUpdate={onStatusUpdate}
            />
          )}
        </div>

        {/* Published By */}
        <div className="flex-shrink-0 w-32">
          {isLoadingDetails ? (
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : (
            <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
              {versionDetails?.publishedBy || version.user?.username || "—"}
            </div>
          )}
        </div>

        {/* Published At */}
        <div className="flex-shrink-0 w-24">
          {isLoadingDetails ? (
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : (
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              {versionDetails?.publishedAt ? formatDate(versionDetails.publishedAt) : formatDate(version.updatedAt)}
            </div>
          )}
        </div>

        {/* Thumbnail Modal for List View */}
        {version.thumbnailId && (
          <ThumbnailModal
            isOpen={isThumbnailModalOpen}
            onClose={handleModalClose}
            thumbnailUrl={version.thumbnailUrl || null}
            versionName={version.name}
            versionNumber={version.version.toString()}
            versionId={version.id}
            thumbnailId={version.thumbnailId}
          />
        )}
      </motion.div>
    );
  }

  // Grid view layout - improved styling to match NoteInput.tsx patterns
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer",
        "min-w-[280px]",
        isSelected && "ring-2 ring-blue-500 border-blue-300 dark:border-blue-600 ring-offset-2",
        className
      )}
      onClick={handleItemClick}
    >
      {/* Selection Checkbox - positioned consistently */}
      <div data-checkbox className="absolute top-3 right-3 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          aria-label={`Select ${version.name}`}
          className="bg-white dark:bg-zinc-900 border-2 shadow-sm"
        />
      </div>

      {/* Header Section - Full width asset name and version */}
      <div className="p-3 pb-2">
        <div className="flex items-center font-medium text-sm truncate text-zinc-900 dark:text-zinc-100 pr-8">
          <span className="truncate">{version.name}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1 flex items-center">- v{version.version}</span>
        </div>
      </div>

      {/* Content Layout: Thumbnail | Data columns */}
      <div className="flex gap-3 p-3 pt-0">
        {/* Thumbnail Container - spans full height of content area */}
        <div 
          data-thumbnail
          className="flex-shrink-0 w-24 bg-zinc-100 dark:bg-zinc-800 rounded cursor-pointer flex items-center justify-center self-stretch"
          onClick={handleThumbnailClick}
        >
          <ThumbnailSuspense
            thumbnailId={version.thumbnailId}
            alt={version.name}
            className="w-full h-full object-contain rounded"
            fallback={
              <div className="relative flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800 rounded">
                <BorderTrail
                  style={{
                    boxShadow: "0px 0px 20px 10px rgb(255 255 255 / 30%), 0 0 30px 20px rgb(0 0 0 / 30%)",
                  }}
                  size={30}
                />
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              </div>
            }
          />
        </div>

        {/* Data Column - Status and Details */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Shot Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400 w-10 text-right flex-shrink-0">
              Shot:
            </span>
            {isLoadingStatuses ? (
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse flex-1 min-w-0" />
            ) : (
              <StatusSelector
                versionId={version.id}
                currentStatus={shotStatus}
                availableStatuses={availableShotStatuses}
                onStatusUpdate={onShotStatusUpdate}
                className="border h-6 border-zinc-200 dark:border-zinc-700 rounded-md text-xs min-w-0 flex-1"
              />
            )}
          </div>

          {/* Version Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400 w-10 text-right flex-shrink-0">
              Status:
            </span>
            {isLoadingStatuses ? (
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse flex-1 min-w-0" />
            ) : (
              <StatusSelector
                versionId={version.id}
                currentStatus={versionStatus}
                availableStatuses={availableStatuses}
                onStatusUpdate={onStatusUpdate}
                className="border h-6 border-zinc-200 dark:border-zinc-700 rounded-md text-xs min-w-0 flex-1"
              />
            )}
          </div>

          {/* Published By */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400 w-10 text-right flex-shrink-0">
              By:
            </span>
            {isLoadingDetails ? (
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse flex-1 min-w-0" />
            ) : (
              <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1 min-w-0">
                {versionDetails?.publishedBy || version.user?.username || "Unknown"}
              </span>
            )}
          </div>

          {/* Published Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400 w-10 text-right flex-shrink-0">
              Date:
            </span>
            {isLoadingDetails ? (
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse flex-1 min-w-0" />
            ) : (
              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                {versionDetails?.publishedAt ? formatDate(versionDetails.publishedAt) : formatDate(version.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Modal */}
      {version.thumbnailId && (
        <ThumbnailModal
          isOpen={isThumbnailModalOpen}
          onClose={handleModalClose}
          thumbnailUrl={version.thumbnailUrl || null}
          versionName={version.name}
          versionNumber={version.version.toString()}
          versionId={version.id}
          thumbnailId={version.thumbnailId}
        />
      )}
    </motion.div>
  );
}; 