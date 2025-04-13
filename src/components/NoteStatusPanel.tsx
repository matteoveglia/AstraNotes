import React, { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ftrackService } from "@/services/ftrack";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./ui/label";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelData {
  versionId: string;
  versionStatusId: string;
  parentId?: string;
  parentStatusId?: string;
  parentType?: string;
  projectId: string;
}

interface NoteStatusPanelProps {
  assetVersionId: string;
  isVisible: boolean;
  onVisibilityChange: (visible: boolean) => void; // Keep this if still needed internally
  onDropdownOpenChange: (isOpen: boolean) => void; // Add the new prop
}

export function NoteStatusPanel({
  assetVersionId,
  isVisible,
  onVisibilityChange,
  onDropdownOpenChange // Add the prop here
}: NoteStatusPanelProps) {
  const [currentStatuses, setCurrentStatuses] =
    useState<StatusPanelData | null>(null);
  const [versionStatuses, setVersionStatuses] = useState<Status[]>([]);
  const [parentStatuses, setParentStatuses] = useState<Status[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Track open state for each select individually
  const [isVersionSelectOpen, setIsVersionSelectOpen] = useState(false);
  const [isParentSelectOpen, setIsParentSelectOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      if (!isVisible || !assetVersionId) return;

      setIsLoading(true);
      try {
        // Fetch current statuses
        const statusData = await ftrackService.fetchStatusPanelData(assetVersionId);
        setCurrentStatuses(statusData);

        // Fetch applicable statuses for version and parent
        const [versionStatusList, parentStatusList] = await Promise.all([
          ftrackService.fetchApplicableStatuses("AssetVersion", assetVersionId),
          statusData.parentId ? ftrackService.fetchApplicableStatuses(statusData.parentType || "Shot", statusData.parentId) : Promise.resolve([])
        ]);

        setVersionStatuses(versionStatusList);
        setParentStatuses(parentStatusList);
      } catch (error) {
        console.error("Error fetching statuses:", error);
        showError("Failed to fetch statuses");
      } finally {
        setIsLoading(false);
      }
    };

    if (isVisible) {
      timeoutId = setTimeout(fetchData, 100); // Small delay to prevent unnecessary API calls
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isVisible, assetVersionId, showError]);

  // This useEffect for click outside might be redundant now if NoteInput handles hover correctly
  // Consider removing or simplifying if the hover logic in NoteInput is sufficient.
  // For now, let's keep it but adjust the logic slightly.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If either select dropdown is open, don't handle click outside here
      // Let the Select component handle its own closing.
      if (isVersionSelectOpen || isParentSelectOpen) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
         // If click is outside the panel AND no dropdown is open, maybe hide?
         // This might still conflict with NoteInput's hover logic.
         // Let's comment this out for now, relying on NoteInput's hover.
         // onVisibilityChange(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // Depend on the individual select open states
  }, [isVisible, onVisibilityChange, isVersionSelectOpen, isParentSelectOpen]);

  const handleStatusChange = async (statusId: string, type: 'version' | 'parent') => {
    if (!currentStatuses) return;

    try {
      if (type === 'version') {
        await ftrackService.updateEntityStatus("AssetVersion", currentStatuses.versionId, statusId);
        setCurrentStatuses(prev => prev ? { ...prev, versionStatusId: statusId } : null);
        showSuccess("Version status updated");
      } else if (type === 'parent' && currentStatuses.parentId && currentStatuses.parentType) {
        await ftrackService.updateEntityStatus(currentStatuses.parentType, currentStatuses.parentId, statusId);
        setCurrentStatuses(prev => prev ? { ...prev, parentStatusId: statusId } : null);
        showSuccess("Shot status updated");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      showError("Failed to update status");
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 min-w-[200px]"
      style={{ transform: 'translateX(50%)' }}
      // Remove internal mouse enter/leave logic, NoteInput handles this now
    >
      <div className="space-y-4">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-50">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-2">Version Status</h3>
          <Select
            value={currentStatuses?.versionStatusId}
            onValueChange={(value) => handleStatusChange(value, 'version')}
            onOpenChange={(open) => {
              setIsVersionSelectOpen(open);
              // Call the callback passed from NoteInput
              onDropdownOpenChange(open || isParentSelectOpen);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {versionStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  <div className="flex items-center gap-2">
                    {status.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                    {status.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentStatuses?.parentId && (
          <div>
            <h3 className="text-sm font-medium mb-2">Shot Status</h3>
            <Select
              value={currentStatuses?.parentStatusId}
              onValueChange={(value) => handleStatusChange(value, 'parent')}
            onOpenChange={(open) => {
              setIsParentSelectOpen(open);
              // Call the callback passed from NoteInput
              onDropdownOpenChange(open || isVersionSelectOpen);
            }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {parentStatuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    <div className="flex items-center gap-2">
                      {status.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                      )}
                      {status.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
