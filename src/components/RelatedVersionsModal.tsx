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
import { relatedVersionsService, VersionStatus } from "@/services/relatedVersionsService";
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
  const [error, setError] = useState<string | null>(null);
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<VersionStatus[]>([]);
  
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
  }>({
    details: {},
    statuses: {},
  });
  
  // React 18 Concurrent features
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [isPending, startTransition] = useTransition();
  
  // Extract shot name from current version
  const shotName = useMemo(() => {
    return relatedVersionsService.extractShotName(currentVersionName);
  }, [currentVersionName]);

  // Fetch related versions when modal opens
  useEffect(() => {
    if (isOpen && shotName) {
      fetchRelatedVersions();
      fetchAvailableStatuses();
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
      setVersionDataCache({ details: {}, statuses: {} });
      setError(null);
    }
  }, [isOpen]);

  const fetchAvailableStatuses = async () => {
    try {
      const statuses = await relatedVersionsService.fetchAllVersionStatuses();
      setAvailableStatuses(statuses);
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

  const batchFetchVersionData = async (versionIds: string[]) => {
    try {
      console.debug("[RelatedVersionsModal] Batch fetching version data for", versionIds.length, "versions");
      
      // Fetch details and statuses in parallel
      const [details, statuses] = await Promise.all([
        relatedVersionsService.batchFetchVersionDetails(versionIds),
        relatedVersionsService.batchFetchVersionStatuses(versionIds),
      ]);
      
      // Update cache
      setVersionDataCache(prev => ({
        details: { ...prev.details, ...details },
        statuses: { ...prev.statuses, ...statuses },
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
      
      setRelatedVersions(sortedVersions);
      setPagination(prev => ({ 
        ...prev, 
        totalItems: sortedVersions.length,
        currentPage: 1 
      }));
      
      // Batch fetch version details and statuses for all versions
      if (sortedVersions.length > 0) {
        batchFetchVersionData(sortedVersions.map(v => v.id));
      }
      
      console.debug(`[RelatedVersionsModal] Found ${sortedVersions.length} related versions`);
    } catch (err) {
      console.error("[RelatedVersionsModal] Failed to fetch related versions:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch related versions");
    } finally {
      setLoading(false);
    }
  };

  // Filter and paginate versions
  const filteredAndPaginatedVersions = useMemo(() => {
    let filtered = relatedVersions;
    
    // Apply search filter
    if (deferredSearchTerm.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(version => 
        version.name.toLowerCase().includes(searchLower) ||
        `v${version.version}`.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(version => {
        const versionStatus = versionDataCache.statuses[version.id];
        return versionStatus && statusFilter.includes(versionStatus.id);
      });
    }
    
    // Update total items for pagination
    const totalItems = filtered.length;
    
    // Apply pagination
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    const paginated = filtered.slice(startIndex, endIndex);
    
    // Update pagination state if needed
    if (totalItems !== pagination.totalItems) {
      setPagination(prev => ({ ...prev, totalItems }));
    }
    
    return {
      versions: paginated,
      totalItems,
      totalPages: Math.ceil(totalItems / pagination.pageSize),
    };
  }, [relatedVersions, deferredSearchTerm, statusFilter, pagination.currentPage, pagination.pageSize, pagination.totalItems]);

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
    const currentPageVersionIds = filteredAndPaginatedVersions.versions.map(v => v.id);
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
      
      const newSelections = filteredAndPaginatedVersions.versions.filter(
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
          ) : filteredAndPaginatedVersions.versions.length === 0 ? (
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
              <div className="flex-1 min-h-0 overflow-auto">
                <AnimatePresence mode="wait">
                  {isPending ? (
                    <motion.div
                      key="pending"
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
                  ) : null}
                  
                  {viewMode === 'grid' ? (
                    <motion.div
                      key="grid"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <RelatedVersionsGrid
                        versions={filteredAndPaginatedVersions.versions}
                        selectedVersionIds={selectedAcrossPages}
                        onVersionToggle={handleVersionToggle}
                        versionDataCache={versionDataCache}
                        availableStatuses={availableStatuses}
                        onStatusUpdate={handleStatusUpdate}
                        loading={false}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <RelatedVersionsList
                        versions={filteredAndPaginatedVersions.versions}
                        selectedVersionIds={selectedAcrossPages}
                        onVersionToggle={handleVersionToggle}
                        onSelectAll={handleSelectAll}
                        versionDataCache={versionDataCache}
                        availableStatuses={availableStatuses}
                        onStatusUpdate={handleStatusUpdate}
                        loading={false}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Pagination controls - always show page size selector */}
              <div className="flex items-center justify-between py-2 px-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                {/* Page size selector - always visible */}
                <div className="flex items-center gap-2">
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

                {/* Page info and navigation - only show when multiple pages */}
                {filteredAndPaginatedVersions.totalPages > 1 ? (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Page {pagination.currentPage} of {filteredAndPaginatedVersions.totalPages} ({filteredAndPaginatedVersions.totalItems} total)
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
                        disabled={pagination.currentPage >= filteredAndPaginatedVersions.totalPages}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {filteredAndPaginatedVersions.totalItems} version{filteredAndPaginatedVersions.totalItems === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            {filteredAndPaginatedVersions.versions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                                 {filteredAndPaginatedVersions.versions.every(v => selectedAcrossPages.has(v.id))
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
      </DialogContent>
    </Dialog>
  );
}; 