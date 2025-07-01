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
import { relatedVersionsService } from "@/services/relatedVersionsService";
import { Grid, List, Search, Filter, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

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
  
  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
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
      setError(null);
    }
  }, [isOpen]);

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
    
    // Apply status filter (placeholder - will be implemented in later phases)
    if (statusFilter.length > 0) {
      // TODO: Implement status filtering
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
      <DialogContent className="max-w-6xl w-full max-h-[90vh] flex flex-col">
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
          
          {/* Status filter placeholder */}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            disabled // Will be enabled in later phases
          >
            <Filter className="h-4 w-4" />
            Filter by Status
          </Button>
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
              {/* Versions content - placeholder for now */}
              <div className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 mb-4">
                <div className="text-center text-zinc-500 dark:text-zinc-400">
                  <p className="mb-2">Found {filteredAndPaginatedVersions.totalItems} related versions</p>
                  <p className="text-sm">
                    {viewMode === 'grid' ? 'Grid' : 'List'} view will be implemented in Phase 2
                  </p>
                  <div className="mt-4 text-left">
                    <h4 className="font-medium mb-2">Versions on current page:</h4>
                    <ul className="space-y-1 text-sm">
                      {filteredAndPaginatedVersions.versions.map(version => (
                        <li key={version.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAcrossPages.has(version.id)}
                            onChange={() => handleVersionToggle(version)}
                          />
                          <span>{version.name} - v{version.version}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Pagination info */}
              <div className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                Page {pagination.currentPage} of {filteredAndPaginatedVersions.totalPages} 
                ({filteredAndPaginatedVersions.totalItems} total versions)
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
                  ? "Deselect Page"
                  : "Select Page"
                }
              </Button>
            )}
            
            {selectedVersions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
              >
                Clear Selection ({selectedVersions.length})
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedVersions.length > 0 && (
              <Button
                onClick={handleAddSelected}
                className="flex items-center gap-2"
              >
                Add {selectedVersions.length} Selected Version{selectedVersions.length === 1 ? '' : 's'}
              </Button>
            )}
            
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 