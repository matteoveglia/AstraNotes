/**
 * @fileoverview RelatedVersionItem.tsx
 * Individual version display component shared between grid and list views.
 * Features thumbnail display, version details, selection state, and loading states.
 * @component
 */

import React, { useState, useEffect } from "react";
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
  viewMode: 'grid' | 'list';
  className?: string;
}

export const RelatedVersionItem: React.FC<RelatedVersionItemProps> = ({
  version,
  isSelected,
  onToggleSelection,
  onThumbnailClick,
  viewMode,
  className,
}) => {
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState(false);
  const [versionDetails, setVersionDetails] = useState<VersionDetails | null>(null);
  const [versionStatus, setVersionStatus] = useState<VersionStatus | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Fetch version details and status when component mounts
  useEffect(() => {
    const fetchVersionData = async () => {
      setIsLoadingDetails(true);
      try {
        // Fetch details and status in parallel
        const [details, statuses] = await Promise.all([
          relatedVersionsService.batchFetchVersionDetails([version.id]),
          relatedVersionsService.batchFetchVersionStatuses([version.id]),
        ]);

        setVersionDetails(details[version.id] || null);
        setVersionStatus(statuses[version.id] || null);
      } catch (error) {
        console.warn("[RelatedVersionItem] Failed to fetch version data:", error);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchVersionData();
  }, [version.id]);

  const handleThumbnailClick = () => {
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
      return new Date(dateString).toLocaleDateString();
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

        {/* Version Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{version.name}</div>
          <div className="text-xs text-zinc-500">v{version.version}</div>
        </div>

        {/* Status Info */}
        <div className="flex-shrink-0 w-24">
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
      </motion.div>
    );
  }

  // Grid view layout - card style
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer",
        isSelected && "ring-2 ring-blue-500 border-blue-300 dark:border-blue-600",
        className
      )}
      onClick={handleItemClick}
    >
      {/* Selection Checkbox */}
      <div data-checkbox className="absolute top-2 left-2 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          aria-label={`Select ${version.name}`}
          className="bg-white dark:bg-zinc-900 shadow-sm"
        />
      </div>

      {/* Thumbnail */}
      <div 
        data-thumbnail
        className="w-full h-32 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden mb-3 cursor-pointer"
        onClick={handleThumbnailClick}
      >
        <ThumbnailSuspense
          thumbnailId={version.thumbnailId}
          alt={version.name}
          className="w-full h-full object-cover"
          fallback={
            <div className="relative flex h-full w-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
              <BorderTrail
                style={{
                  boxShadow: "0px 0px 30px 15px rgb(255 255 255 / 30%), 0 0 50px 30px rgb(0 0 0 / 30%)",
                }}
                size={60}
              />
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          }
        />
      </div>

      {/* Version Details */}
      <div className="space-y-2">
        {/* Asset Name and Version */}
        <div>
          <h3 className="font-medium text-sm truncate">{version.name}</h3>
          <p className="text-xs text-zinc-500">v{version.version}</p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-zinc-400"></div>
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {isLoadingDetails ? "Loading..." : (versionStatus?.name || "Unknown")}
          </span>
        </div>

        {/* Published Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <User className="w-3 h-3" />
            <span className="truncate">
              {isLoadingDetails ? "Loading..." : (versionDetails?.publishedBy || version.user?.username || "Unknown")}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <Calendar className="w-3 h-3" />
            <span>
              {isLoadingDetails ? "Loading..." : (
                versionDetails?.publishedAt ? formatDate(versionDetails.publishedAt) : formatDate(version.updatedAt)
              )}
            </span>
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