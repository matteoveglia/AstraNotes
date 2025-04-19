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
}

export const ModificationsBanner: React.FC<ModificationsBannerProps> = ({
  addedCount,
  removedCount,
  onUpdate,
  isUpdating,
  addedVersions,
  removedVersions,
}) => {
  if (addedCount === 0 && removedCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 px-3 py-1 rounded-md text-sm"
    >
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help flex items-center">
                <InfoIcon size={14} className="text-amber-700" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
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
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>
          {addedCount > 0 &&
            `${addedCount} version${addedCount !== 1 ? "s" : ""} added`}
          {addedCount > 0 && removedCount > 0 && ", "}
          {removedCount > 0 &&
            `${removedCount} version${removedCount !== 1 ? "s" : ""} removed`}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 bg-amber-50 hover:bg-amber-200 border-amber-300 text-amber-800"
        onClick={onUpdate}
        disabled={isUpdating}
      >
        {isUpdating ? "Updating..." : "Update Playlist"}
      </Button>
    </motion.div>
  );
};
