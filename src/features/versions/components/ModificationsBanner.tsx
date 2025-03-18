/**
 * @fileoverview ModificationsBanner.tsx
 * Component for displaying playlist modifications and allowing users to apply changes.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { AssetVersion } from "@/types";
import { motion } from "motion/react";

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
      className="flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1 rounded-md text-sm"
    >
      <span>
        {addedCount > 0 &&
          `${addedCount} version${addedCount !== 1 ? "s" : ""} added`}
        {addedCount > 0 && removedCount > 0 && ", "}
        {removedCount > 0 &&
          `${removedCount} version${removedCount !== 1 ? "s" : ""} removed`}
      </span>
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
