import React from "react";
import { Button } from "./ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { AssetVersion } from "../types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PlaylistModifiedBannerProps {
  addedCount: number;
  removedCount: number;
  onUpdate: () => void;
  addedVersions: AssetVersion[];
  removedVersions: AssetVersion[];
  isUpdating?: boolean;
}

export const PlaylistModifiedBanner: React.FC<PlaylistModifiedBannerProps> = ({
  addedCount,
  removedCount,
  onUpdate,
  addedVersions,
  removedVersions,
  isUpdating = false,
}) => {
  if (addedCount === 0 && removedCount === 0) return null;

  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      {addedVersions.length > 0 && (
        <div>
          <div className="font-medium text-green-600">Added:</div>
          <ul className="list-disc pl-4 text-sm">
            {addedVersions.map((v) => (
              <li key={`${v.name}-${v.version}`}>
                {v.name} (v{v.version})
              </li>
            ))}
          </ul>
        </div>
      )}
      {removedVersions.length > 0 && (
        <div>
          <div className="font-medium text-red-600">Removed:</div>
          <ul className="list-disc pl-4 text-sm">
            {removedVersions.map((v) => (
              <li key={`${v.name}-${v.version}`}>
                {v.name} (v{v.version})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2 bg-yellow-50/80 border border-yellow-200 text-yellow-800 px-2 py-1 rounded-md text-sm">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              <span>
                {addedCount > 0 &&
                  `${addedCount} version${addedCount === 1 ? "" : "s"} added`}
                {addedCount > 0 && removedCount > 0 && ", "}
                {removedCount > 0 &&
                  `${removedCount} version${removedCount === 1 ? "" : "s"} removed`}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 hover:bg-yellow-100/80 text-yellow-800 flex items-center gap-1"
        onClick={onUpdate}
        disabled={isUpdating}
      >
        <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
        <span className="ml-1">Update</span>
      </Button>
    </div>
  );
};
