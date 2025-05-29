/**
 * @fileoverview VersionFilter.tsx
 * Filter dropdown component for version filtering by note status and labels.
 * Allows users to filter versions based on note status (draft, published, empty, reviewed)
 * and by note labels with color-coded options.
 * @component
 */

import React from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useLabelStore } from "@/store/labelStore";
import { cn } from "@/lib/utils";
import { NoteStatus } from "@/types";

interface VersionFilterProps {
  /** Selected note statuses for filtering */
  selectedStatuses: NoteStatus[];
  /** Selected label IDs for filtering */
  selectedLabels: string[];
  /** Selected version IDs to check against */
  selectedVersions: string[];
  /** Callback when status filters change */
  onStatusChange: (statuses: NoteStatus[]) => void;
  /** Callback when label filters change */
  onLabelChange: (labelIds: string[]) => void;
  /** Callback to clear all filters */
  onClearFilters: () => void;
}

const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  empty: "Empty",
  draft: "Draft",
  published: "Published",
  reviewed: "Selected",
};

export const VersionFilter: React.FC<VersionFilterProps> = ({
  selectedStatuses,
  selectedLabels,
  selectedVersions,
  onStatusChange,
  onLabelChange,
  onClearFilters,
}) => {
  const { labels } = useLabelStore();

  const hasActiveFilters =
    selectedStatuses.length > 0 || selectedLabels.length > 0;

  const handleStatusToggle = (status: NoteStatus) => {
    if (selectedStatuses.includes(status)) {
      onStatusChange(selectedStatuses.filter((s) => s !== status));
    } else {
      onStatusChange([...selectedStatuses, status]);
    }
  };

  const handleLabelToggle = (labelId: string) => {
    if (selectedLabels.includes(labelId)) {
      onLabelChange(selectedLabels.filter((id) => id !== labelId));
    } else {
      onLabelChange([...selectedLabels, labelId]);
    }
  };

  // Helper function to determine text color based on background color
  const getContrastColor = (hexColor: string) => {
    const color = hexColor.replace("#", "");
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);

    const sRGB = [r / 255, g / 255, b / 255].map((val) => {
      if (val <= 0.03928) {
        return val / 12.92;
      }
      return Math.pow((val + 0.055) / 1.055, 2.4);
    });

    const luminance = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
    return luminance > 0.5 ? "#000000" : "#FFFFFF";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-7 px-2 gap-1",
            hasActiveFilters && "text-blue-600 dark:text-blue-400",
          )}
          title="Filter Versions"
        >
          <Filter className="w-4 h-4" />
          {hasActiveFilters && (
            <span className="text-xs">
              ({selectedStatuses.length + selectedLabels.length})
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Filter Versions</DropdownMenuLabel>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClearFilters}
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Note Status</DropdownMenuLabel>
        {(Object.keys(NOTE_STATUS_LABELS) as NoteStatus[]).map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={selectedStatuses.includes(status)}
            onCheckedChange={() => handleStatusToggle(status)}
          >
            {NOTE_STATUS_LABELS[status]}
          </DropdownMenuCheckboxItem>
        ))}

        {labels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Note Labels</DropdownMenuLabel>
            {labels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={selectedLabels.includes(label.id)}
                onCheckedChange={() => handleLabelToggle(label.id)}
                className="relative"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="truncate">{label.name}</span>
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
