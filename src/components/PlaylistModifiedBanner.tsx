import React from 'react';
import { Button } from './ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
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
  addedVersions: { name: string; version: number }[];
  removedVersions: { name: string; version: number }[];
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
            {addedVersions.map(v => (
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
            {removedVersions.map(v => (
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
            <AlertCircle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="font-medium flex items-center gap-2">
        {addedCount > 0 && (
          <span>
            <span className="text-green-600 font-medium">{addedCount}</span>
            <span className="text-gray-600 font-normal ml-1">Added</span>
          </span>
        )}
        {addedCount > 0 && removedCount > 0 && (
          <span className="text-gray-400">•</span>
        )}
        {removedCount > 0 && (
          <span>
            <span className="text-red-600 font-medium">{removedCount}</span>
            <span className="text-gray-600 font-normal ml-1">Removed</span>
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 hover:bg-yellow-100/80 text-yellow-800 flex items-center gap-1"
        onClick={onUpdate}
        disabled={isUpdating}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
        Update
      </Button>
    </div>
  );
};
