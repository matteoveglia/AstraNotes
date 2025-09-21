/**
 * @fileoverview PublishingControls.tsx
 * Component for managing note publishing operations including publishing selected notes,
 * publishing all notes, and accessing additional note management options.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { PlaylistMenu } from "@/components/PlaylistMenu";
import { GlowEffect } from "@/components/ui/glow-effect";
import { VersionFilter } from "@/features/versions/components/VersionFilter";
import { RefreshCw } from "lucide-react";
import { NoteStatus } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PublishingControlsProps {
  selectedCount: number;
  draftCount: number;
  isPublishing: boolean;
  onPublishSelected: () => void;
  onPublishAll: () => void;
  onClearAllNotes: () => void;
  onSetAllLabels: (labelId: string) => void;
  onClearAllSelections: () => void;
  // Props for left-side controls
  isQuickNotes: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  // Disable refresh button (e.g., when playlist deleted in ftrack)
  refreshDisabled?: boolean;
  // Filter props
  selectedStatuses: NoteStatus[];
  selectedLabels: string[];
  selectedVersions: string[];
  onStatusChange: (statuses: NoteStatus[]) => void;
  onLabelChange: (labelIds: string[]) => void;
  onClearFilters: () => void;
}

export const PublishingControls: React.FC<PublishingControlsProps> = ({
  selectedCount,
  draftCount,
  isPublishing,
  onPublishSelected,
  onPublishAll,
  onClearAllNotes,
  onSetAllLabels,
  onClearAllSelections,
  isQuickNotes,
  isRefreshing,
  onRefresh,
  refreshDisabled,
  selectedStatuses,
  selectedLabels,
  selectedVersions,
  onStatusChange,
  onLabelChange,
  onClearFilters,
}) => {
  return (
    <div className="flex items-center gap-2">
      {/* Publishing controls */}
      <Button
        size="sm"
        variant="outline"
        className="relative z-10 hover:scale-103 transition-all duration-200 hover:shadow-lg"
        onClick={onPublishSelected}
        disabled={selectedCount === 0 || isPublishing}
      >
        Publish {selectedCount} Selected
      </Button>
      <div className="relative inline-block">
        {draftCount > 0 && !isPublishing && (
          <GlowEffect
            colors={["#FF5733", "#33FF57", "#3357FF", "#F1C40F"]}
            mode="pulse"
            blur="soft"
            duration={3}
            scale={1.1}
          />
        )}
        <Button
          size="sm"
          onClick={onPublishAll}
          disabled={draftCount === 0 || isPublishing}
          className="relative z-10 hover:scale-102 transition-all duration-200 hover:shadow-lg"
        >
          Publish All Notes
        </Button>
      </div>

      {/* Separator */}
      <div className="ml-3 mr-1 w-px bg-foreground/20 self-stretch" />

      {/* Right-side controls: Refresh, Filter, and Menu */}
      {!isQuickNotes && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={onRefresh}
                disabled={isRefreshing || Boolean(refreshDisabled)}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              <p>
                Refresh applies the latest ftrack changes immediately: adds new
                versions and removes missing ones. No confirmation step.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <VersionFilter
        selectedStatuses={selectedStatuses}
        selectedLabels={selectedLabels}
        selectedVersions={selectedVersions}
        onStatusChange={onStatusChange}
        onLabelChange={onLabelChange}
        onClearFilters={onClearFilters}
      />
      <PlaylistMenu
        onClearAllNotes={onClearAllNotes}
        onSetAllLabels={onSetAllLabels}
        onClearAllSelections={onClearAllSelections}
      />
    </div>
  );
};
