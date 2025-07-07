/**
 * @fileoverview RelatedVersionsModal.tsx
 * Modal component for displaying and selecting related versions from the same shot.
 * Features grid/list view switching, search, filtering, pagination, and multi-select capabilities.
 * @component
 */

import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { AssetVersion } from "@/types";
import {
  relatedVersionsService,
  VersionStatus,
  ShotStatus,
} from "@/services/relatedVersionsService";
import {
  Grid,
  List as ListIcon,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  X,
  ChevronsUpDown,
} from "lucide-react";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { RelatedVersionsGrid } from "./RelatedVersionsGrid";
import { RelatedVersionsList } from "./RelatedVersionsList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useToast } from "./ui/toast";
import { playlistStore } from "@/store/playlist";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { ftrackStatusService } from "@/services/ftrack/FtrackStatusService";

interface RelatedVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAssetVersionId: string;
  currentVersionName: string;
  onVersionsSelect: (versions: AssetVersion[]) => void;
}

type ViewMode = "grid" | "list";

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

export const RelatedVersionsModal: React.FC<RelatedVersionsModalProps> = ({
  isOpen,
  onClose,
  currentAssetVersionId,
  currentVersionName,
  onVersionsSelect,
}) => {
  // Hooks must be called at the top level
  const toast = useToast();

  // Core state
  const [relatedVersions, setRelatedVersions] = useState<AssetVersion[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<AssetVersion[]>([]);
  const [selectedAcrossPages, setSelectedAcrossPages] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [progressiveLoading, setProgressiveLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // 0–100 for Phase 6.1
  const [error, setError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<VersionStatus[]>(
    [],
  );
  const [availableShotStatuses, setAvailableShotStatuses] = useState<
    ShotStatus[]
  >([]);

  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
  });

  // Centralized version data cache
  const [versionDataCache, setVersionDataCache] = useState<{
    details: Record<string, any>;
    statuses: Record<string, any>;
    shotStatuses: Record<string, any>;
  }>({
    details: {},
    statuses: {},
    shotStatuses: {},
  });

  // React 18 Concurrent features
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Removed useTransition as it was preventing state commit in some browsers (Phase 5.10 follow-up)
  // const [isPending, startTransition] = useTransition();

  const isPending = false;

  // AbortController for cancelling requests when modal closes
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Extract shot name from current version
  const shotName = useMemo(() => {
    return relatedVersionsService.extractShotName(currentVersionName);
  }, [currentVersionName]);

  // Sort info coming from list view
  const [sortInfo, setSortInfo] = useState<{
    field: "name" | "version" | "publishedBy" | "updatedAt";
    direction: "asc" | "desc";
  }>({
    field: "updatedAt",
    direction: "desc",
  });

  // Fetch related versions when modal opens
  useEffect(() => {
    if (isOpen && shotName) {
      fetchRelatedVersions();
    }
  }, [isOpen, shotName]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        console.debug("[RelatedVersionsModal] Cancelling ongoing requests due to modal close");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      setSelectedVersions([]);
      setSelectedAcrossPages(new Set());
      setSearchTerm("");
      setStatusFilter([]);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
      setVersionDataCache({ details: {}, statuses: {}, shotStatuses: {} });
      setError(null);
      setProgressiveLoading(false);
    }
  }, [isOpen]);

  const fetchAvailableStatusesForVersions = async (
    versions: AssetVersion[],
  ) => {
    try {
      // We need at least one version to get statuses for that project
      if (versions.length === 0) {
        console.debug(
          "[RelatedVersionsModal] No versions available, skipping status fetch",
        );
        return;
      }

      // Use the first version to get all available statuses for the project
      const firstVersionId = versions[0].id;

      // For shot statuses, we need to get the parent entity from status panel data
      const statusData =
        await ftrackStatusService.fetchStatusPanelData(firstVersionId);

      const promises = [
        relatedVersionsService.fetchAllVersionStatuses(firstVersionId),
      ];

      // Only fetch shot statuses if we have parent info
      if (statusData?.parentId && statusData?.parentType) {
        promises.push(
          relatedVersionsService.fetchAllShotStatuses(statusData.parentId),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      const [versionStatuses, shotStatuses] = await Promise.all(promises);

      setAvailableStatuses(versionStatuses);
      setAvailableShotStatuses(shotStatuses);
    } catch (error) {
      console.warn(
        "[RelatedVersionsModal] Failed to fetch available statuses:",
        error,
      );
    }
  };

  const handleStatusUpdate = async (versionId: string, newStatusId: string) => {
    console.debug(
      `[RelatedVersionsModal] Updating status for version ${versionId} to ${newStatusId}`,
    );
    try {
      // Optimistic UI update
      setVersionDataCache((prev) => {
        const newStatuses = { ...prev.statuses };
        const newStatus = availableStatuses.find((s) => s.id === newStatusId);
        if (newStatuses[versionId] && newStatus) {
          newStatuses[versionId] = newStatus;
        }
        return { ...prev, statuses: newStatuses };
      });

      // Call ftrack service to update status
      await ftrackStatusService.updateEntityStatus(
        versionId,
        "AssetVersion",
        newStatusId,
      );
      console.debug(
        `[RelatedVersionsModal] Successfully updated status for version ${versionId}`,
      );
    } catch (error) {
      console.error(
        `[RelatedVersionsModal] Failed to update status for version ${versionId}:`,
        error,
      );
      // Revert UI on failure (optional, could show toast instead)
      // For now, we'll leave the optimistic update
    }
  };

  const handleShotStatusUpdate = async (
    versionId: string,
    newStatusId: string,
  ) => {
    console.debug(
      `[RelatedVersionsModal] Updating shot status for version ${versionId} to ${newStatusId}`,
    );
    try {
      // Get the parent entity information from status panel data
      const statusData = await ftrackStatusService.fetchStatusPanelData(versionId);
      if (!statusData?.parentId || !statusData?.parentType) {
        console.warn(
          `[RelatedVersionsModal] No parent entity found for version ${versionId}`,
        );
        return;
      }

      // Optimistic UI update
      setVersionDataCache((prev) => {
        const newShotStatuses = { ...prev.shotStatuses };
        const newStatus = availableShotStatuses.find(
          (s) => s.id === newStatusId,
        );
        if (newStatus) {
          newShotStatuses[versionId] = newStatus;
        }
        return { ...prev, shotStatuses: newShotStatuses };
      });

      // Call ftrack service to update the parent entity status
      await ftrackStatusService.updateEntityStatus(
        statusData.parentId,
        statusData.parentType,
        newStatusId,
      );
      console.debug(
        `[RelatedVersionsModal] Successfully updated shot status for version ${versionId}`,
      );
    } catch (error) {
      console.error(
        `[RelatedVersionsModal] Failed to update shot status for version ${versionId}:`,
        error,
      );
      // Revert UI on failure (optional, could show toast instead)
    }
  };

  const batchFetchVersionData = async (versionIds: string[]) => {
    try {
      console.debug(
        "[RelatedVersionsModal] Batch fetching version data for",
        versionIds.length,
        "versions",
      );

      // Fetch details, statuses, and shot statuses in parallel
      const [details, statuses, shotStatuses] = await Promise.all([
        relatedVersionsService.batchFetchVersionDetails(versionIds),
        relatedVersionsService.batchFetchVersionStatuses(versionIds),
        relatedVersionsService.batchFetchShotStatuses(versionIds),
      ]);

      // Update cache
      setVersionDataCache((prev) => ({
        details: { ...prev.details, ...details },
        statuses: { ...prev.statuses, ...statuses },
        shotStatuses: { ...prev.shotStatuses, ...shotStatuses },
      }));

      console.debug(
        "[RelatedVersionsModal] Cached version data for",
        Object.keys(details).length,
        "versions",
      );
    } catch (error) {
      console.warn(
        "[RelatedVersionsModal] Failed to batch fetch version data:",
        error,
      );
    }
  };

  const fetchRelatedVersions = async () => {
    setLoading(true);
    setError(null);

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;

    try {
      console.debug(
        "[RelatedVersionsModal] Fetching related versions for shot:",
        shotName,
      );
      const versions =
        await relatedVersionsService.fetchVersionsByShotName(shotName);

      // Check if request was aborted
      if (currentAbortController.signal.aborted) {
        console.debug("[RelatedVersionsModal] Request aborted during fetchVersionsByShotName");
        return;
      }

      // Filter out the current version
      const filteredVersions = versions.filter(
        (v) => v.id !== currentAssetVersionId,
      );

      // Sort by publishedAt (newest first) - using updatedAt as proxy for now
      const sortedVersions = filteredVersions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      // Show basic version data immediately
      setRelatedVersions(sortedVersions);
      setPagination((prev) => ({
        ...prev,
        totalItems: sortedVersions.length,
        currentPage: 1,
      }));
      setLoading(false); // Stop blocking loader here

      console.debug(
        `[RelatedVersionsModal] Showing ${sortedVersions.length} related versions with basic data`,
      );

      // Start progressive loading for additional data (Phase 6.1)
      if (sortedVersions.length > 0) {
        setProgressiveLoading(true);
        setLoadingProgress(0);

        try {
          // Step 1 – fetch available statuses (10%)
          await fetchAvailableStatusesForVersions(sortedVersions);
          if (currentAbortController.signal.aborted) {
            console.debug("[RelatedVersionsModal] Request aborted during fetchAvailableStatusesForVersions");
            return;
          }
          setLoadingProgress(10);

          // Prepare IDs
          const versionIds = sortedVersions.map((v) => v.id);

          // Step 2 – version details (40%)
          const details =
            await relatedVersionsService.batchFetchVersionDetails(versionIds);
          if (currentAbortController.signal.aborted) {
            console.debug("[RelatedVersionsModal] Request aborted during batchFetchVersionDetails");
            return;
          }
          setVersionDataCache((prev) => ({
            ...prev,
            details: { ...prev.details, ...details },
          }));
          setLoadingProgress(40);

          // Step 3 – version statuses (70%)
          const statuses =
            await relatedVersionsService.batchFetchVersionStatuses(versionIds);
          if (currentAbortController.signal.aborted) {
            console.debug("[RelatedVersionsModal] Request aborted during batchFetchVersionStatuses");
            return;
          }
          setVersionDataCache((prev) => ({
            ...prev,
            statuses: { ...prev.statuses, ...statuses },
          }));
          setLoadingProgress(70);

          // Step 4 – shot statuses (100%)
          const shotStatuses =
            await relatedVersionsService.batchFetchShotStatuses(versionIds);
          if (currentAbortController.signal.aborted) {
            console.debug("[RelatedVersionsModal] Request aborted during batchFetchShotStatuses");
            return;
          }
          setVersionDataCache((prev) => ({
            ...prev,
            shotStatuses: { ...prev.shotStatuses, ...shotStatuses },
          }));
          setLoadingProgress(100);

          console.debug("[RelatedVersionsModal] Progressive loading completed");
        } catch (progressiveError) {
          if (currentAbortController.signal.aborted) {
            console.debug("[RelatedVersionsModal] Progressive loading aborted");
            return;
          }
          console.warn(
            "[RelatedVersionsModal] Progressive loading failed:",
            progressiveError,
          );
          // Don't set error state - basic functionality still works
        } finally {
          // Only set timeout if not aborted
          if (!currentAbortController.signal.aborted) {
            // Allow a brief moment for 100% to be visible before fading out
            setTimeout(() => {
              setProgressiveLoading(false);
            }, 400);
          }
        }
      }
    } catch (err) {
      console.error(
        "[RelatedVersionsModal] Failed to fetch related versions:",
        err,
      );
      setError(
        err instanceof Error ? err.message : "Failed to fetch related versions",
      );
      setLoading(false);
    }
  };

  // Filter versions (without pagination)
  const filteredVersions = useMemo(() => {
    let filtered = relatedVersions;

    // Apply search filter
    if (deferredSearchTerm.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (version) =>
          version.name.toLowerCase().includes(searchLower) ||
          `v${String(version.version)}`.toLowerCase().includes(searchLower),
      );
    }

    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((version) => {
        const versionStatus = versionDataCache.statuses[version.id];
        return versionStatus && statusFilter.includes(versionStatus.id);
      });
    }

    return filtered;
  }, [
    relatedVersions,
    deferredSearchTerm,
    statusFilter,
    versionDataCache.statuses,
  ]);

  // Apply sorting globally so both grid & list views respect the same order (Phase 6.2)
  const sortedFilteredVersions = useMemo(() => {
    const versions = [...filteredVersions];
    const { field, direction } = sortInfo;

    const getValue = (v: AssetVersion) => {
      switch (field) {
        case "name":
          return v.name.toLowerCase();
        case "version":
          return v.version;
        case "publishedBy":
          return (v.user?.username || "").toLowerCase();
        case "updatedAt":
        default:
          return new Date(v.updatedAt).getTime();
      }
    };

    versions.sort((a, b) => {
      const aVal = getValue(a);
      const bVal = getValue(b);
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

    return versions;
  }, [filteredVersions, sortInfo]);

  // Reset page to 1 when search or filter changes.
  useEffect(() => {
    if (pagination.currentPage !== 1) {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }
    // We specifically want to run this effect only when filters change,
    // not when other pagination state like currentPage changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearchTerm, statusFilter]);

  // Update total items when the filtered list changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, totalItems: filteredVersions.length }));
  }, [filteredVersions]);

  // Paginate the filtered & sorted versions
  const paginatedVersions = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return sortedFilteredVersions.slice(startIndex, endIndex);
  }, [sortedFilteredVersions, pagination.currentPage, pagination.pageSize]);

  // Summary text for pagination toolbar (Phase 5.6)
  const summaryText = useMemo(() => {
    const visible = paginatedVersions.length;
    const total = relatedVersions.length;

    const plural = (n: number) => (n === 1 ? "" : "s");

    let countPart = `Showing ${visible}`;

    if (total !== visible) {
      countPart += ` of ${total}`;
    }

    countPart += ` version${plural(total)}`;

    // Human readable sort label mapping
    const sortLabels: Record<string, string> = {
      updatedAt: "Date",
      name: "Name",
      version: "Version",
      publishedBy: "Published By",
    };
    const dirLabels: Record<"asc" | "desc", string> = {
      asc: "ascending",
      desc: "descending",
    };

    const sortText = `Sorted by ${sortLabels[sortInfo.field] || sortInfo.field} (${dirLabels[sortInfo.direction]})`;

    return `${countPart} • ${sortText}`;
  }, [paginatedVersions.length, relatedVersions.length, sortInfo]);

  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
  };

  const handleVersionToggle = (version: AssetVersion) => {
    const isSelected = selectedAcrossPages.has(version.id);

    setSelectedAcrossPages((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.delete(version.id);
      } else {
        newSet.add(version.id);
      }
      return newSet;
    });

    setSelectedVersions((prev) => {
      if (isSelected) {
        return prev.filter((v) => v.id !== version.id);
      } else {
        return [...prev, version];
      }
    });
  };

  const handleSelectAll = () => {
    const currentPageVersionIds = paginatedVersions.map((v) => v.id);
    const allSelected = currentPageVersionIds.every((id) =>
      selectedAcrossPages.has(id),
    );

    if (allSelected) {
      // Deselect all on current page
      setSelectedAcrossPages((prev) => {
        const newSet = new Set(prev);
        currentPageVersionIds.forEach((id) => newSet.delete(id));
        return newSet;
      });

      setSelectedVersions((prev) =>
        prev.filter((v) => !currentPageVersionIds.includes(v.id)),
      );
    } else {
      // Select all on current page
      setSelectedAcrossPages((prev) => {
        const newSet = new Set(prev);
        currentPageVersionIds.forEach((id) => newSet.add(id));
        return newSet;
      });

      const newSelections = paginatedVersions.filter(
        (v) => !selectedAcrossPages.has(v.id),
      );

      setSelectedVersions((prev) => [...prev, ...newSelections]);
    }
  };

  const handleClearSelection = () => {
    setSelectedVersions([]);
    setSelectedAcrossPages(new Set());
  };

  const handleAddSelected = async () => {
    if (selectedVersions.length === 0) return;

    try {
      // Flag versions as manually added
      const versionsWithFlag = selectedVersions.map((v) => ({
        ...v,
        manuallyAdded: true,
      }));
      // Add to playlist via store (uses active playlist from store)
      const { activePlaylistId } = usePlaylistsStore.getState();
      if (!activePlaylistId) {
        toast.showError("No active playlist selected");
        return;
      }
      await playlistStore.addVersionsToPlaylist(
        activePlaylistId,
        versionsWithFlag,
      );

      onVersionsSelect(versionsWithFlag); // notify parent if needed
      toast.showSuccess(
        `Added ${versionsWithFlag.length} version${versionsWithFlag.length === 1 ? "" : "s"} to playlist`,
      );
      onClose();
    } catch (error) {
      console.error(`[RelatedVersionsModal] Failed to add versions:`, error);
      toast.showError("Failed to add versions to playlist");
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, currentPage: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPagination((prev) => ({
      ...prev,
      pageSize: newPageSize,
      currentPage: 1, // Reset to first page when changing page size
    }));
  };

  // Inverse-selection helper for the Version Status filter
  const handleStatusInverse = () => {
    const allStatusIds = availableStatuses.map((s) => s.id);
    const unselected = allStatusIds.filter((id) => !statusFilter.includes(id));
    setStatusFilter(unselected);
  };

  // Removed the early return so that the component remains mounted when closed.
  // This allows Radix/shadcn exit animations (`animate-out`) to play, fixing the
  // "modal lacks close animation" issue (Phase 5.11).
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        /* Full-screen modal with 1.5rem padding on all sides but WITHOUT expensive translate centering.
           Overriding Radix default classes by specifying explicit inset + translate-x/y-0 greatly reduces
           style/paint work when the window resizes (Phase 6.5, pass 2). */
        className="fixed inset-6 translate-x-0 translate-y-0 w-auto h-auto max-w-none flex flex-col p-6"
        /* Phase 6.5: Apply CSS containment to isolate internal layout & paint during window resize */
        style={{ contain: "layout paint" }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <span>Related Versions for Shot: {shotName}</span>
            <div className="flex items-center gap-2 mr-8">
              {/* Progressive loading pill (Phase 6.1) */}
              <AnimatePresence>
                {progressiveLoading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-xs font-medium px-3 py-1 rounded-full"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{`Loading Additional Data (${loadingProgress}%)`}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* View mode toggle */}
              <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none border-r border-zinc-200 dark:border-zinc-700",
                    viewMode === "grid" && "bg-zinc-100 dark:bg-zinc-800",
                  )}
                  onClick={() => handleViewModeChange("grid")}
                  title="Grid View"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none",
                    viewMode === "list" && "bg-zinc-100 dark:bg-zinc-800",
                  )}
                  onClick={() => handleViewModeChange("list")}
                  title="List View"
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Search and filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
            {/* Match toolbar control height (h-8) for visual alignment – Phase 5.12 */}
            <Input
              placeholder="Search versions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-10"
            />
          </div>

          {/* Status filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                disabled={availableStatuses.length === 0}
              >
                <Filter className="h-4 w-4" />
                <span>
                  {statusFilter.length > 0
                    ? `${statusFilter.length} Selected`
                    : "Filter by Version Status"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1">
              <TooltipProvider>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="p-0">
                    Filter by Version Status
                  </DropdownMenuLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-auto p-1 text-xs",
                          statusFilter.length > 0
                            ? "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={handleStatusInverse}
                        disabled={availableStatuses.length === 0}
                      >
                        <CircleSlash className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Inverse selection</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              <DropdownMenuSeparator />

              {availableStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status.id}
                  checked={statusFilter.includes(status.id)}
                  onCheckedChange={(checked) => {
                    setStatusFilter((prev) =>
                      checked
                        ? [...prev, status.id]
                        : prev.filter((id) => id !== status.id),
                    );
                  }}
                >
                  <div className="flex items-center gap-2">
                    {status.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                    <span>{status.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}

              {statusFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setStatusFilter([])}
                    className="flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Clear
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort dropdown (Phase 6.2) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <ChevronsUpDown className="h-4 w-4" />
                <span>Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 mt-1">
              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {[
                { field: "name", label: "Asset Name" },
                { field: "version", label: "Version" },
                { field: "publishedBy", label: "Published By" },
                { field: "updatedAt", label: "Date" },
              ].map(({ field, label }) => (
                <React.Fragment key={field}>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortInfo({ field: field as any, direction: "asc" })
                    }
                    className={cn(
                      "flex justify-between",
                      sortInfo.field === field &&
                        sortInfo.direction === "asc" &&
                        "bg-zinc-100 dark:bg-zinc-800",
                    )}
                  >
                    {label} (Asc)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortInfo({ field: field as any, direction: "desc" })
                    }
                    className={cn(
                      "flex justify-between",
                      sortInfo.field === field &&
                        sortInfo.direction === "desc" &&
                        "bg-zinc-100 dark:bg-zinc-800",
                    )}
                  >
                    {label} (Desc)
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progressive loading banner removed in favour of pill (Phase 6.1) */}

        {/* Content area */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading related versions...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-600 dark:text-red-400 mb-2">
                  Error loading related versions
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                  {error}
                </p>
                <Button
                  onClick={fetchRelatedVersions}
                  variant="outline"
                  size="sm"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : paginatedVersions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                  {deferredSearchTerm.trim()
                    ? "No versions match your search"
                    : "No related versions found"}
                </p>
                {deferredSearchTerm.trim() && (
                  <Button
                    onClick={() => setSearchTerm("")}
                    variant="outline"
                    size="sm"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Versions content */}
              <div className="flex-1 min-h-0 overflow-auto relative">
                {/* Removed transient switching overlay to avoid visual flash (Phase 5.10) */}

                {/* Reverted to "sync" now that item-level animations causing the flash are removed */}
                <AnimatePresence mode="sync">
                  <motion.div
                    key={viewMode}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {viewMode === "grid" ? (
                      <RelatedVersionsGrid
                        versions={paginatedVersions}
                        selectedVersionIds={selectedAcrossPages}
                        onVersionToggle={handleVersionToggle}
                        onStatusUpdate={handleStatusUpdate}
                        onShotStatusUpdate={handleShotStatusUpdate}
                        availableStatuses={availableStatuses}
                        availableShotStatuses={availableShotStatuses}
                        versionDataCache={versionDataCache}
                      />
                    ) : (
                      <RelatedVersionsList
                        versions={paginatedVersions}
                        selectedVersionIds={selectedAcrossPages}
                        onVersionToggle={handleVersionToggle}
                        onStatusUpdate={handleStatusUpdate}
                        onShotStatusUpdate={handleShotStatusUpdate}
                        availableStatuses={availableStatuses}
                        availableShotStatuses={availableShotStatuses}
                        versionDataCache={versionDataCache}
                        onSelectAll={handleSelectAll}
                        onSortChange={(
                          field: string,
                          direction: "asc" | "desc",
                        ) => setSortInfo({ field: field as any, direction })}
                        sortInfo={sortInfo as any}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* Footer with pagination and actions */}
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          {paginatedVersions.length > 0 && (
            <div className="flex items-center py-2 px-2 bg-zinc-50 dark:bg-zinc-800/50">
              {/* Left section – page size selector (always visible) */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Show:
                </span>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(value) =>
                    handlePageSizeChange(parseInt(value))
                  }
                >
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  per page
                </span>
              </div>

              {/* Center section – version / filter summary (always visible) */}
              <div className="flex-1 flex items-center justify-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                  {summaryText}
                </span>
              </div>

              {/* Right section – pagination info & controls (only if more than one page) */}
              <div className="flex items-center gap-4 flex-1 justify-end">
                {Math.ceil(pagination.totalItems / pagination.pageSize) > 1 && (
                  <>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      Page {pagination.currentPage} of{" "}
                      {Math.ceil(pagination.totalItems / pagination.pageSize)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handlePageChange(pagination.currentPage - 1)
                        }
                        disabled={pagination.currentPage <= 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handlePageChange(pagination.currentPage + 1)
                        }
                        disabled={
                          pagination.currentPage >=
                          Math.ceil(pagination.totalItems / pagination.pageSize)
                        }
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3">
            <div className="flex items-center gap-2">
              {paginatedVersions.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {paginatedVersions.every((v) => selectedAcrossPages.has(v.id))
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                disabled={selectedVersions.length === 0}
              >
                Clear Selection{" "}
                {selectedVersions.length > 0
                  ? `(${selectedVersions.length})`
                  : ""}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleAddSelected}
                disabled={selectedVersions.length === 0}
                className="flex items-center gap-2"
              >
                Add{" "}
                {selectedVersions.length > 0
                  ? `${selectedVersions.length} `
                  : ""}
                Selected Version{selectedVersions.length === 1 ? "" : "s"} to
                Playlist
              </Button>

              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
