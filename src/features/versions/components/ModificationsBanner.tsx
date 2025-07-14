/**
 * @fileoverview ModificationsBanner.tsx
 * Component for displaying playlist modifications and allowing users to apply changes.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { AssetVersion } from "@/types";
import { motion } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface ModificationsBannerProps {
  addedCount: number;
  removedCount: number;
  onUpdate: () => void;
  isUpdating: boolean;
  addedVersions: AssetVersion[];
  removedVersions: AssetVersion[];
  isPlaylistDeleted?: boolean;
}

export const ModificationsBanner: React.FC<ModificationsBannerProps> = ({
  addedCount,
  removedCount,
  onUpdate,
  isUpdating,
  addedVersions,
  removedVersions,
  isPlaylistDeleted = false,
}) => {
  // Show banner for deleted playlists even if no version changes
  if (!isPlaylistDeleted && addedCount === 0 && removedCount === 0) return null;

  // Special styling for deleted playlists
  const bannerClasses = isPlaylistDeleted
    ? "flex items-center gap-2 bg-red-100 dark:bg-red-950 text-red-950 dark:text-red-100 px-3 py-1 rounded-md text-sm"
    : "flex items-center gap-2 bg-purple-100 dark:bg-purple-950 text-purple-950 dark:text-purple-100 px-3 py-1 rounded-md text-sm";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={bannerClasses}
    >
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help flex items-center">
                <InfoIcon
                  size={14}
                  className={
                    isPlaylistDeleted
                      ? "text-red-700 dark:text-red-300"
                      : "text-purple-700 dark:text-purple-300"
                  }
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isPlaylistDeleted ? (
                <div>
                  This playlist has been deleted from ftrack. You can continue
                  to use it but it will be removed when you restart the app.
                </div>
              ) : (
                <div className="space-y-2">
                  {addedVersions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Added:</h4>
                      <ul className="space-y-1">
                        {addedVersions.map((version) => (
                          <li
                            key={`added-${version.id}`}
                            className="flex items-center"
                          >
                            <span className="text-green-500 mr-1">+</span>
                            {version.name} - v{version.version}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {removedVersions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Removed:</h4>
                      <ul className="space-y-1">
                        {removedVersions.map((version) => (
                          <li
                            key={`removed-${version.id}`}
                            className="flex items-center"
                          >
                            <span className="text-red-500 mr-1">-</span>
                            {version.name} - v{version.version}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>
          {isPlaylistDeleted ? (
            "Playlist Deleted in ftrack"
          ) : (
            <>
              {addedCount > 0 &&
                `${addedCount} version${addedCount !== 1 ? "s" : ""} added`}
              {addedCount > 0 && removedCount > 0 && ", "}
              {removedCount > 0 &&
                `${removedCount} version${removedCount !== 1 ? "s" : ""} removed`}
            </>
          )}
        </span>
      </div>
      {!isPlaylistDeleted && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 bg-purple-50 hover:bg-purple-200 hover:text-purple-700 border-purple-300 text-purple-800 dark:bg-purple-800 dark:hover:bg-purple-600 dark:text-purple-100"
          onClick={onUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating..." : "Update Playlist"}
        </Button>
      )}
    </motion.div>
  );
};
