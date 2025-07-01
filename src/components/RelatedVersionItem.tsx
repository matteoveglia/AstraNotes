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
import { Loader2, User, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { relatedVersionsService, VersionDetails, VersionStatus } from "@/services/relatedVersionsService";

interface RelatedVersionItemProps {
  version: AssetVersion;
  isSelected: boolean;
  onToggleSelection: (version: AssetVersion) => void;
  onThumbnailClick?: (version: AssetVersion) => void;
  versionDataCache?: {
    details: Record<string, any>;
    statuses: Record<string, any>;
  };
  viewMode: 'grid' | 'list';
  className?: string;
}

export const RelatedVersionItem: React.FC<RelatedVersionItemProps> = ({
  version,
  isSelected,
  onToggleSelection,
  onThumbnailClick,
  versionDataCache,
  viewMode,
  className,
}) => {
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  
  // Use cached data instead of fetching
  const versionDetails = versionDataCache?.details[version.id] || null;
  const versionStatus = versionDataCache?.statuses[version.id] || null;
  const isLoadingDetails = !versionDataCache?.details[version.id] && !versionDataCache?.statuses[version.id];

  const handleThumbnailClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering item selection
    if (version.thumbnailId) {
      setIsThumbnailModalOpen(true);
    }
    onThumbnailClick?.(version);
  };

  const handleItemClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on thumbnail or checkbox
    const target = e.target as HTMLElement;
    if (target.closest('[data-thumbnail]') || target.closest('[data-checkbox]')) {
      return;
    }
    
    onToggleSelection(version);
  };

  const handleCheckboxChange = (checked: boolean) => {
    onToggleSelection(version);
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
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Ready
          </div>
        </div>

        {/* Version Status */}
        <div className="flex-shrink-0 w-32">
          {isLoadingDetails ? (
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          ) : (
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              {versionStatus?.name || "—"}
            </div>
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
            onClose={() => setIsThumbnailModalOpen(false)}
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

  // Grid view layout - horizontal layout as per spec
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:shadow-md transition-all cursor-pointer m-1",
        isSelected && "ring-2 ring-blue-500 border-blue-300 dark:border-blue-600 ring-offset-2",
        className
      )}
      onClick={handleItemClick}
    >
      {/* Selection Checkbox - better positioning */}
      <div data-checkbox className="absolute top-3 right-3 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          aria-label={`Select ${version.name}`}
          className="bg-white dark:bg-zinc-900 border-2"
        />
      </div>

      {/* Horizontal Layout: Thumbnail Left, Data Right */}
      <div className="flex gap-2">
        {/* Thumbnail - 120px width as per spec */}
        <div 
          data-thumbnail
          className="flex-shrink-0 w-[120px] h-20 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden cursor-pointer"
          onClick={handleThumbnailClick}
        >
          <ThumbnailSuspense
            thumbnailId={version.thumbnailId}
            alt={version.name}
            className="w-full h-full object-contain"
            fallback={
              <div className="relative flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
                <BorderTrail
                  style={{
                    boxShadow: "0px 0px 20px 10px rgb(255 255 255 / 30%), 0 0 30px 20px rgb(0 0 0 / 30%)",
                  }}
                  size={40}
                />
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              </div>
            }
          />
        </div>

        {/* Version Data - Right side */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Asset Name and Version */}
          <div>
            <h3 className="font-medium text-sm truncate">{version.name} - v{version.version}</h3>
          </div>

          {/* Shot Status (placeholder) */}
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Shot Status: {isLoadingDetails ? "Loading..." : "Ready"}
          </div>

          {/* Version Status */}
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Version Status: {isLoadingDetails ? "Loading..." : (versionStatus?.name || "Unknown")}
          </div>

          {/* Published By */}
          <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
            By: {isLoadingDetails ? "Loading..." : (versionDetails?.publishedBy || version.user?.username || "Unknown")}
          </div>

          {/* Published Date */}
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Date: {isLoadingDetails ? "Loading..." : (
              versionDetails?.publishedAt ? formatDate(versionDetails.publishedAt) : formatDate(version.updatedAt)
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail Modal */}
      {version.thumbnailId && (
        <ThumbnailModal
          isOpen={isThumbnailModalOpen}
          onClose={() => setIsThumbnailModalOpen(false)}
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