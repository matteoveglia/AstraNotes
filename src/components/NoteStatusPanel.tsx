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
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";

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
  onDropdownOpenChange: (isOpen: boolean) => void;
  className?: string;
}

export function NoteStatusPanel({
  assetVersionId,
  isVisible,
  onDropdownOpenChange,
  className
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

        // Fetch applicable statuses for version and parent using new schema mapping
        const [versionStatusList, parentStatusList] = await Promise.all([
          ftrackService.getStatusesForEntity("AssetVersion", assetVersionId),
          statusData.parentId && statusData.parentType
            ? ftrackService.getStatusesForEntity(statusData.parentType, statusData.parentId)
            : Promise.resolve([])
        ]);
        console.debug('[NoteStatusPanel] Version statuses:', versionStatusList);
        console.debug('[NoteStatusPanel] Parent statuses:', parentStatusList);
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
    <DismissableLayer
      disableOutsidePointerEvents={false}
      onEscapeKeyDown={() => {
        if (typeof onDropdownOpenChange === 'function') onDropdownOpenChange(false);
      }}
      onPointerDownOutside={() => {
        if (typeof onDropdownOpenChange === 'function') onDropdownOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          "absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 min-w-[200px]",
          className
        )}
        style={{ transform: 'translateX(50%)' }}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-base">Statuses</span>
          <button
            type="button"
            className="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
            onClick={() => {
              if (typeof onDropdownOpenChange === 'function') onDropdownOpenChange(false);
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
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
    </DismissableLayer>
  );
}
