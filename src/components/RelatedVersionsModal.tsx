/**
 * @fileoverview RelatedVersionsModal.tsx  
 * Modal component for displaying and selecting related versions from the same shot.
 * Features grid/list view switching, search, filtering, pagination, and multi-select capabilities.
 * @component
 */

import React, { useState, useEffect, useMemo, useDeferredValue, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { AssetVersion } from "@/types";
import { relatedVersionsService, VersionStatus, ShotStatus } from "@/services/relatedVersionsService";
import { Grid, List, Search, Filter, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "./ui/dropdown-menu";
import { ftrackService } from "@/services/ftrack";

interface RelatedVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAssetVersionId: string;
  currentVersionName: string;
  onVersionsSelect: (versions: AssetVersion[]) => void;
}

type ViewMode = 'grid' | 'list';

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
  // Core state
  const [relatedVersions, setRelatedVersions] = useState<AssetVersion[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<AssetVersion[]>([]);
  const [selectedAcrossPages, setSelectedAcrossPages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [progressiveLoading, setProgressiveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<VersionStatus[]>([]);
  const [availableShotStatuses, setAvailableShotStatuses] = useState<ShotStatus[]>([]);
  
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
  const [isPending, startTransition] = useTransition();
  
  // Extract shot name from current version
  const shotName = useMemo(() => {
    return relatedVersionsService.extractShotName(currentVersionName);
  }, [currentVersionName]);

  // Sort info coming from list view
  const [sortInfo, setSortInfo] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'updatedAt',
    direction: 'desc',
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
      setSelectedVersions([]);
      setSelectedAcrossPages(new Set());
      setSearchTerm("");
      setStatusFilter([]);
      setPagination(prev => ({ ...prev, currentPage: 1 }));
      setVersionDataCache({ details: {}, statuses: {}, shotStatuses: {} });
      setError(null);
      setProgressiveLoading(false);
    }
  }, [isOpen]);

  const fetchAvailableStatusesForVersions = async (versions: AssetVersion[]) => {
    try {
      // We need at least one version to get statuses for that project
      if (versions.length === 0) {
        console.debug("[RelatedVersionsModal] No versions available, skipping status fetch");
        return;
      }

      // Use the first version to get all available statuses for the project
      const firstVersionId = versions[0].id;
      
      // For shot statuses, we need to get the parent entity from status panel data
      const statusData = await ftrackService.fetchStatusPanelData(firstVersionId);
      
      const promises = [
        relatedVersionsService.fetchAllVersionStatuses(firstVersionId),
      ];
      
      // Only fetch shot statuses if we have parent info
      if (statusData?.parentId && statusData?.parentType) {
        promises.push(relatedVersionsService.fetchAllShotStatuses(statusData.parentId));
      } else {
        promises.push(Promise.resolve([]));
      }
      
      const [versionStatuses, shotStatuses] = await Promise.all(promises);
      
      setAvailableStatuses(versionStatuses);
      setAvailableShotStatuses(shotStatuses);
    } catch (error) {
      console.warn("[RelatedVersionsModal] Failed to fetch available statuses:", error);
    }
  };

  const handleStatusUpdate = async (versionId: string, newStatusId: string) => {
    console.debug(`[RelatedVersionsModal] Updating status for version ${versionId} to ${newStatusId}`);
    try {
      // Optimistic UI update
      setVersionDataCache(prev => {
        const newStatuses = { ...prev.statuses };
        const newStatus = availableStatuses.find(s => s.id === newStatusId);
        if (newStatuses[versionId] && newStatus) {
          newStatuses[versionId] = newStatus;
        }
        return { ...prev, statuses: newStatuses };
      });
      
      // Call ftrack service to update status
      await ftrackService.updateEntityStatus("AssetVersion", versionId, newStatusId);
      console.debug(`[RelatedVersionsModal] Successfully updated status for version ${versionId}`);
    } catch (error) {
      console.error(`[RelatedVersionsModal] Failed to update status for version ${versionId}:`, error);
      // Revert UI on failure (optional, could show toast instead)
      // For now, we'll leave the optimistic update
    }
  };

  const handleShotStatusUpdate = async (versionId: string, newStatusId: string) => {
    console.debug(`[RelatedVersionsModal] Updating shot status for version ${versionId} to ${newStatusId}`);
    try {
      // Get the parent entity information from status panel data
      const statusData = await ftrackService.fetchStatusPanelData(versionId);
      if (!statusData?.parentId || !statusData?.parentType) {
        console.warn(`[RelatedVersionsModal] No parent entity found for version ${versionId}`);
        return;
      }

      // Optimistic UI update
      setVersionDataCache(prev => {
        const newShotStatuses = { ...prev.shotStatuses };
        const newStatus = availableShotStatuses.find(s => s.id === newStatusId);
        if (newStatus) {
          newShotStatuses[versionId] = newStatus;
        }
        return { ...prev, shotStatuses: newShotStatuses };
      });
      
      // Call ftrack service to update the parent entity status
      await ftrackService.updateEntityStatus(statusData.parentType, statusData.parentId, newStatusId);
      console.debug(`[RelatedVersionsModal] Successfully updated shot status for version ${versionId}`);
    } catch (error) {
      console.error(`[RelatedVersionsModal] Failed to update shot status for version ${versionId}:`, error);
      // Revert UI on failure (optional, could show toast instead)
    }
  };

  const batchFetchVersionData = async (versionIds: string[]) => {
    try {
      console.debug("[RelatedVersionsModal] Batch fetching version data for", versionIds.length, "versions");
      
      // Fetch details, statuses, and shot statuses in parallel
      const [details, statuses, shotStatuses] = await Promise.all([
        relatedVersionsService.batchFetchVersionDetails(versionIds),
        relatedVersionsService.batchFetchVersionStatuses(versionIds),
        relatedVersionsService.batchFetchShotStatuses(versionIds),
      ]);
      
      // Update cache
      setVersionDataCache(prev => ({
        details: { ...prev.details, ...details },
        statuses: { ...prev.statuses, ...statuses },
        shotStatuses: { ...prev.shotStatuses, ...shotStatuses },
      }));
      
      console.debug("[RelatedVersionsModal] Cached version data for", Object.keys(details).length, "versions");
    } catch (error) {
      console.warn("[RelatedVersionsModal] Failed to batch fetch version data:", error);
    }
  };

  const fetchRelatedVersions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.debug("[RelatedVersionsModal] Fetching related versions for shot:", shotName);
      const versions = await relatedVersionsService.fetchVersionsByShotName(shotName);
      
      // Filter out the current version
      const filteredVersions = versions.filter(v => v.id !== currentAssetVersionId);
      
      // Sort by publishedAt (newest first) - using updatedAt as proxy for now
      const sortedVersions = filteredVersions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      // Show basic version data immediately
      setRelatedVersions(sortedVersions);
      setPagination(prev => ({ 
        ...prev, 
        totalItems: sortedVersions.length,
        currentPage: 1 
      }));
      setLoading(false); // Stop blocking loader here
      
      console.debug(`[RelatedVersionsModal] Showing ${sortedVersions.length} related versions with basic data`);
      
      // Start progressive loading for additional data
      if (sortedVersions.length > 0) {
        setProgressiveLoading(true);
        
        try {
          // Fetch available statuses first (needed for dropdowns)
          await fetchAvailableStatusesForVersions(sortedVersions);
          
          // Then progressively load version details and statuses
          await batchFetchVersionData(sortedVersions.map(v => v.id));
          
          console.debug("[RelatedVersionsModal] Progressive loading completed");
        } catch (progressiveError) {
          console.warn("[RelatedVersionsModal] Progressive loading failed:", progressiveError);
          // Don't set error state - basic functionality still works
        } finally {
          setProgressiveLoading(false);
        }
      }
      
    } catch (err) {
      console.error("[RelatedVersionsModal] Failed to fetch related versions:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch related versions");
      setLoading(false);
    }
  };

  // Filter versions (without pagination)
  const filteredVersions = useMemo(() => {
    let filtered = relatedVersions;

    // Apply search filter
    if (deferredSearchTerm.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(version =>
        version.name.toLowerCase().includes(searchLower) ||
        `v${String(version.version)}`.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(version => {
        const versionStatus = versionDataCache.statuses[version.id];
        return versionStatus && statusFilter.includes(versionStatus.id);
      });
    }

    return filtered;
  }, [relatedVersions, deferredSearchTerm, statusFilter, versionDataCache.statuses]);

  // Reset page to 1 when search or filter changes.
  useEffect(() => {
    if (pagination.currentPage !== 1) {
      setPagination(prev => ({ ...prev, currentPage: 1 }));
    }
  // We specifically want to run this effect only when filters change,
  // not when other pagination state like currentPage changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearchTerm, statusFilter]);

  // Update total items when the filtered list changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, totalItems: filteredVersions.length }));
  }, [filteredVersions]);
  
  // Paginate the filtered versions
  const paginatedVersions = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return filteredVersions.slice(startIndex, endIndex);
  }, [filteredVersions, pagination.currentPage, pagination.pageSize]);

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
      updatedAt: 'Date',
      name: 'Name',
      version: 'Version',
      publishedBy: 'Published By',
    };
    const dirLabels: Record<'asc' | 'desc', string> = {
      asc: 'ascending',
      desc: 'descending',
    };

    const sortText = `Sorted by ${sortLabels[sortInfo.field] || sortInfo.field} (${dirLabels[sortInfo.direction]})`;

    return `${countPart} • ${sortText}`;
  }, [paginatedVersions.length, relatedVersions.length, sortInfo]);

  const handleViewModeChange = (newMode: ViewMode) => {
    startTransition(() => {
      setViewMode(newMode);
    });
  };

  const handleVersionToggle = (version: AssetVersion) => {
    const isSelected = selectedAcrossPages.has(version.id);
    
    setSelectedAcrossPages(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.delete(version.id);
      } else {
        newSet.add(version.id);
      }
      return newSet;
    });
    
    setSelectedVersions(prev => {
      if (isSelected) {
        return prev.filter(v => v.id !== version.id);
      } else {
        return [...prev, version];
      }
    });
  };

  const handleSelectAll = () => {
    const currentPageVersionIds = paginatedVersions.map(v => v.id);
    const allSelected = currentPageVersionIds.every(id => selectedAcrossPages.has(id));
    
    if (allSelected) {
      // Deselect all on current page
      setSelectedAcrossPages(prev => {
        const newSet = new Set(prev);
        currentPageVersionIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      
      setSelectedVersions(prev => 
        prev.filter(v => !currentPageVersionIds.includes(v.id))
      );
    } else {
      // Select all on current page
      setSelectedAcrossPages(prev => {
        const newSet = new Set(prev);
        currentPageVersionIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      const newSelections = paginatedVersions.filter(
        v => !selectedAcrossPages.has(v.id)
      );
      
      setSelectedVersions(prev => [...prev, ...newSelections]);
    }
  };

  const handleClearSelection = () => {
    setSelectedVersions([]);
    setSelectedAcrossPages(new Set());
  };

  const handleAddSelected = () => {
    if (selectedVersions.length > 0) {
      onVersionsSelect(selectedVersions);
      onClose();
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, currentPage: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPagination(prev => ({ 
      ...prev, 
      pageSize: newPageSize, 
      currentPage: 1 // Reset to first page when changing page size
    }));
  };

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-3rem)] h-[calc(100vh-3rem)] max-w-none flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <span>Related Versions for Shot: {shotName}</span>
            <div className="flex items-center gap-2 mr-8">
              {/* View mode toggle */}
              <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none border-r border-zinc-200 dark:border-zinc-700",
                    viewMode === 'grid' && "bg-zinc-100 dark:bg-zinc-800"
                  )}
                  onClick={() => handleViewModeChange('grid')}
                  title="Grid View"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none",
                    viewMode === 'list' && "bg-zinc-100 dark:bg-zinc-800"
                  )}
                  onClick={() => handleViewModeChange('list')}
                  title="List View"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Search and filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search versions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
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
                    ? `${statusFilter.length} Statuses Selected`
                    : "Filter by Status"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Version Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status.id}
                  checked={statusFilter.includes(status.id)}
                  onCheckedChange={(checked) => {
                    setStatusFilter((prev) =>
                      checked
                        ? [...prev, status.id]
                        : prev.filter((id) => id !== status.id)
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
                  <DropdownMenuItem onClick={() => setStatusFilter([])}>
                    Clear Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progressive loading indicator */}
        {progressiveLoading && (
          <div className="flex items-center justify-center py-2 bg-blue-50 dark:bg-blue-900/20 border-y border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading additional data...</span>
            </div>
          </div>
        )}

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
                <p className="text-red-600 dark:text-red-400 mb-2">Error loading related versions</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{error}</p>
                <Button onClick={fetchRelatedVersions} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            </div>
          ) : paginatedVersions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                  {deferredSearchTerm.trim() ? "No versions match your search" : "No related versions found"}
                </p>
                {deferredSearchTerm.trim() && (
                  <Button onClick={() => setSearchTerm("")} variant="outline" size="sm">
                    Clear Search
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Versions content */}
              <div className="flex-1 min-h-0 overflow-auto relative">
                {/* Loading overlay outside of AnimatePresence */}
                {isPending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.7 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 flex items-center justify-center z-10"
                  >
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Switching view...</span>
                    </div>
                  </motion.div>
                )}
                
                <AnimatePresence mode="sync">
                  <motion.div
                    key={viewMode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {viewMode === 'grid' ? (
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
                        onSortChange={(field: string, direction: 'asc' | 'desc') => setSortInfo({ field, direction })}
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
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Show:</span>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(value) => handlePageSizeChange(parseInt(value))}
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
                <span className="text-sm text-zinc-600 dark:text-zinc-400">per page</span>
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
                      Page {pagination.currentPage} of {Math.ceil(pagination.totalItems / pagination.pageSize)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={pagination.currentPage <= 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={pagination.currentPage >= Math.ceil(pagination.totalItems / pagination.pageSize)}
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                                 {paginatedVersions.every(v => selectedAcrossPages.has(v.id))
                   ? "Deselect All"
                   : "Select All"
                 }
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              disabled={selectedVersions.length === 0}
            >
              Clear Selection {selectedVersions.length > 0 ? `(${selectedVersions.length})` : ''}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleAddSelected}
              disabled={selectedVersions.length === 0}
              className="flex items-center gap-2"
            >
              Add {selectedVersions.length > 0 ? `${selectedVersions.length} ` : ''}Selected Version{selectedVersions.length === 1 ? '' : 's'} to Playlist
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