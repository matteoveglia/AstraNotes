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
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { motion } from "motion/react";

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
  onClose?: () => void;
  className?: string;
}

// Add a simple in-memory cache for status data
const statusPanelCache: {
  [key: string]: {
    timestamp: number;
    currentStatuses: StatusPanelData;
    versionStatuses: Status[];
    parentStatuses: Status[];
  };
} = {};
const CACHE_TTL = 30 * 1000; // 30 seconds

export function NoteStatusPanel({
  assetVersionId,
  onClose,
  className,
}: NoteStatusPanelProps) {
  const [currentStatuses, setCurrentStatuses] =
    useState<StatusPanelData | null>(null);
  const [versionStatuses, setVersionStatuses] = useState<Status[]>([]);
  const [parentStatuses, setParentStatuses] = useState<Status[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [shouldOpenUpward, setShouldOpenUpward] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Track open state for each select individually
  const [isVersionSelectOpen, setIsVersionSelectOpen] = useState(false);
  const [isParentSelectOpen, setIsParentSelectOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  // Check if panel should open upward to avoid overflow
  useEffect(() => {
    const checkPosition = () => {
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const panelHeight = 200; // Approximate panel height

        setShouldOpenUpward(spaceBelow < panelHeight && rect.top > panelHeight);
      }
    };

    checkPosition();
    window.addEventListener("resize", checkPosition);
    return () => window.removeEventListener("resize", checkPosition);
  }, []);

  // Helper to get cache key
  const getCacheKey = (assetVersionId: string, parentId?: string) => {
    return `${assetVersionId}:${parentId || "none"}`;
  };

  useEffect(() => {
    // Clear stale cache on mount to ensure fresh data
    Object.keys(statusPanelCache).forEach((key) => {
      delete statusPanelCache[key];
    });
    let cancelled = false;

    const fetchData = async () => {
      if (!assetVersionId) return;
      setIsLoading(true);
      try {
        // Always fetch currentStatuses first
        const statusData =
          await ftrackService.fetchStatusPanelData(assetVersionId);
        setCurrentStatuses(statusData);
        const cacheKey = getCacheKey(assetVersionId, statusData.parentId);
        const cached = statusPanelCache[cacheKey];
        let versionStatusList: Status[] = [];
        let parentStatusList: Status[] = [];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          // Use cached data
          versionStatusList = cached.versionStatuses;
          parentStatusList = cached.parentStatuses;
          console.debug(
            "[NoteStatusPanel] Using cached status panel data",
            cacheKey,
          );
        } else {
          // Fetch applicable statuses for version and parent using new schema mapping
          [versionStatusList, parentStatusList] = await Promise.all([
            ftrackService.getStatusesForEntity("AssetVersion", assetVersionId),
            statusData.parentId && statusData.parentType
              ? ftrackService.getStatusesForEntity(
                  statusData.parentType,
                  statusData.parentId,
                )
              : Promise.resolve([]),
          ]);
          // Update cache
          statusPanelCache[cacheKey] = {
            timestamp: Date.now(),
            currentStatuses: statusData,
            versionStatuses: versionStatusList,
            parentStatuses: parentStatusList,
          };
          console.debug("[NoteStatusPanel] Cached status panel data", cacheKey);
        }
        if (!cancelled) {
          setVersionStatuses(versionStatusList);
          setParentStatuses(parentStatusList);
        }
      } catch (error) {
        console.error("Error fetching statuses:", error);
        showError("Failed to fetch statuses");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [assetVersionId]);

  const handleStatusChange = async (
    statusId: string,
    type: "version" | "parent",
  ) => {
    if (!currentStatuses) return;

    try {
      if (type === "version") {
        await ftrackService.updateEntityStatus(
          "AssetVersion",
          currentStatuses.versionId,
          statusId,
        );
        setCurrentStatuses((prev) =>
          prev ? { ...prev, versionStatusId: statusId } : null,
        );
        showSuccess("Version status updated");
      } else if (
        type === "parent" &&
        currentStatuses.parentId &&
        currentStatuses.parentType
      ) {
        await ftrackService.updateEntityStatus(
          currentStatuses.parentType,
          currentStatuses.parentId,
          statusId,
        );
        setCurrentStatuses((prev) =>
          prev ? { ...prev, parentStatusId: statusId } : null,
        );
        showSuccess("Shot status updated");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      showError("Failed to update status");
    }
  };

  // Panel is always open when rendered; closing is handled by parent
  return (
    <div ref={panelRef}>
      <DismissableLayer
        disableOutsidePointerEvents={false}
        onEscapeKeyDown={() => {
          if (onClose) onClose();
        }}
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-select-trigger]") ||
            target.closest("[data-select-content]")
          ) {
            event.preventDefault();
            return;
          }
          if (onClose) onClose();
        }}
        onFocusOutside={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-select-trigger]") ||
            target.closest("[data-select-content]")
          ) {
            event.preventDefault();
            return;
          }
        }}
      >
        <motion.div
          className={cn(
            "absolute -right-34 z-50 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-600 p-4 min-w-[250px]",
            shouldOpenUpward ? "bottom-full mb-2" : "top-full mt-2",
            className,
          )}
          style={{ transform: "translateX(50%)" }}
          initial={{ opacity: 0, scale: 0.95, y: 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 0 }}
          transition={{ type: "spring", duration: 0.25 }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-sm">Statuses</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (onClose) onClose();
              }}
              className="h-6 w-6 p-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            {isLoading && (
              <div className="absolute inset-0 bg-white/80 dark:bg-zinc-800/80 flex items-center justify-center z-50 rounded-lg">
                <Loader2
                  className="h-6 w-6 animate-spin"
                  data-testid="loader"
                />
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium mb-2">Version Status</h3>
              <Select
                value={currentStatuses?.versionStatusId || ""}
                onValueChange={(value) => handleStatusChange(value, "version")}
                onOpenChange={(open) => {
                  setIsVersionSelectOpen(open);
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
                  value={currentStatuses?.parentStatusId || ""}
                  onValueChange={(value) => handleStatusChange(value, "parent")}
                  onOpenChange={(open) => {
                    setIsParentSelectOpen(open);
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
        </motion.div>
      </DismissableLayer>
    </div>
  );
}
