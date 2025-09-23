/**
 * @fileoverview RelatedNotesModal.tsx
 * Modal component for displaying threaded notes from the same shot.
 * Features search, filtering, and displays notes with user info, labels, and attachments.
 * @component
 */

import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Search,
  Filter,
  Loader2,
  X,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
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
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { relatedNotesService } from "@/services/relatedNotesService";
import { ShotNoteItem } from "./ShotNoteItem";
import { NoteAttachmentViewer } from "./NoteAttachmentViewer";
import { ThumbnailModal } from "./ThumbnailModal";
import type {
  ShotNote,
  NoteLabel,
  NoteAttachment,
  RelatedNotesFilter,
  RelatedNotesSortConfig,
  NotesLoadingError,
} from "@/types/relatedNotes";

interface RelatedNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAssetVersionId: string;
  currentVersionName: string;
}

type ViewMode = "threaded" | "compact";

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

export const RelatedNotesModal: React.FC<RelatedNotesModalProps> = ({
  isOpen,
  onClose,
  currentAssetVersionId,
  currentVersionName,
}) => {
  // Core state
  const [notes, setNotes] = useState<ShotNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressiveLoading, setProgressiveLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<NotesLoadingError | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("threaded");
  const [searchTerm, setSearchTerm] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [availableAuthors, setAvailableAuthors] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [availableLabels, setAvailableLabels] = useState<NoteLabel[]>([]);

  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
  });

  // Sort state
  const [sortConfig, setSortConfig] = useState<RelatedNotesSortConfig>({
    field: "createdAt",
    direction: "desc",
  });

  // Thumbnail modal state
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [selectedThumbnail, setSelectedThumbnail] = useState<{
    versionId: string;
    thumbnailId?: string;
    versionName: string;
    versionNumber: number;
  } | null>(null);

  // Attachment viewer state
  const [attachmentViewerOpen, setAttachmentViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] =
    useState<NoteAttachment | null>(null);

  // React 18 Concurrent features
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // AbortController for cancelling requests when modal closes
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Extract shot name from current version
  const shotName = useMemo(() => {
    return relatedNotesService.extractShotName(currentVersionName);
  }, [currentVersionName]);

  // Fetch notes when modal opens
  useEffect(() => {
    if (isOpen && shotName) {
      fetchNotes();
    }
  }, [isOpen, shotName]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        console.debug(
          "[RelatedNotesModal] Cancelling ongoing requests due to modal close",
        );
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setSearchTerm("");
      setAuthorFilter([]);
      setLabelFilter([]);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
      setError(null);
      setProgressiveLoading(false);
      setThumbnailModalOpen(false);
      setSelectedThumbnail(null);
    }
  }, [isOpen]);

  const fetchNotes = async () => {
    setLoading(true);
    setError(null);

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      console.debug("[RelatedNotesModal] Fetching notes for shot:", shotName);

      const fetchedNotes =
        await relatedNotesService.fetchNotesByShotName(shotName);

      // Filter out notes from the current version to avoid showing the user their own note
      const filteredNotes = fetchedNotes.filter(
        (note) => note.version.id !== currentAssetVersionId,
      );

      setNotes(filteredNotes);
      setPagination((prev) => ({
        ...prev,
        totalItems: filteredNotes.length,
        currentPage: 1,
      }));

      // Extract unique authors and labels for filtering
      const authors = Array.from(
        new Map(
          filteredNotes.map((note) => [
            note.user.id,
            {
              id: note.user.id,
              name:
                `${note.user.firstName || ""} ${note.user.lastName || ""}`.trim() ||
                note.user.username,
            },
          ]),
        ).values(),
      );

      const labels = Array.from(
        new Map(
          filteredNotes
            .flatMap((note) => note.labels)
            .map((label) => [label.id, label]),
        ).values(),
      );

      setAvailableAuthors(authors);
      setAvailableLabels(labels);

      console.debug(
        `[RelatedNotesModal] Loaded ${filteredNotes.length} notes for shot ${shotName}`,
      );
    } catch (err) {
      console.error(
        "[RelatedNotesModal] Failed to fetch notes for shot:",
        shotName,
        err,
      );
      setError({
        type: "api",
        message: `Failed to fetch notes for shot ${shotName}`,
        details: err,
        retryable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes;

    // Apply search filter
    if (deferredSearchTerm.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (note) =>
          note.content.toLowerCase().includes(searchLower) ||
          note.user.username.toLowerCase().includes(searchLower) ||
          `${note.user.firstName || ""} ${note.user.lastName || ""}`
            .toLowerCase()
            .includes(searchLower) ||
          note.version.name.toLowerCase().includes(searchLower),
      );
    }

    // Apply author filter
    if (authorFilter.length > 0) {
      filtered = filtered.filter((note) => authorFilter.includes(note.user.id));
    }

    // Apply label filter
    if (labelFilter.length > 0) {
      filtered = filtered.filter((note) =>
        note.labels.some((label) => labelFilter.includes(label.id)),
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const { field, direction } = sortConfig;
      let aVal: any, bVal: any;

      switch (field) {
        case "createdAt":
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          break;
        case "author":
          aVal =
            `${a.user.firstName || ""} ${a.user.lastName || ""}`.trim() ||
            a.user.username;
          bVal =
            `${b.user.firstName || ""} ${b.user.lastName || ""}`.trim() ||
            b.user.username;
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
          break;
        case "version":
          aVal = a.version.name.toLowerCase();
          bVal = b.version.name.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [notes, deferredSearchTerm, authorFilter, labelFilter, sortConfig]);

  // Paginate the filtered & sorted notes
  const paginatedNotes = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return filteredAndSortedNotes.slice(startIndex, endIndex);
  }, [filteredAndSortedNotes, pagination.currentPage, pagination.pageSize]);

  // Update total items when the filtered list changes
  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      totalItems: filteredAndSortedNotes.length,
    }));
  }, [filteredAndSortedNotes]);

  // Reset page to 1 when search or filter changes
  useEffect(() => {
    if (pagination.currentPage !== 1) {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }
  }, [deferredSearchTerm, authorFilter, labelFilter]);

  // Handle thumbnail click
  const handleThumbnailClick = (versionId: string, thumbnailId?: string) => {
    const note = notes.find((n) => n.version.id === versionId);
    if (note) {
      setSelectedThumbnail({
        versionId,
        thumbnailId,
        versionName: note.version.name,
        versionNumber: note.version.version,
      });
      setThumbnailModalOpen(true);
    }
  };

  // Handle attachment click -> open viewer
  const handleAttachmentClick = (attachment: NoteAttachment) => {
    setSelectedAttachment(attachment);
    setAttachmentViewerOpen(true);
  };

  // Handle retry
  const handleRetry = () => {
    fetchNotes();
  };

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, currentPage: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPagination((prev) => ({
      ...prev,
      pageSize: newPageSize,
      currentPage: 1,
    }));
  };

  // Summary text for pagination
  const summaryText = useMemo(() => {
    const visible = paginatedNotes.length;
    const total = notes.length;
    const filtered = filteredAndSortedNotes.length;

    let text = `Showing ${visible}`;
    if (filtered !== total) {
      text += ` of ${filtered} filtered`;
    }
    text += ` of ${total} total note${total === 1 ? "" : "s"}`;

    return text;
  }, [paginatedNotes.length, notes.length, filteredAndSortedNotes.length]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="fixed inset-6 translate-x-0 translate-y-0 w-auto h-auto max-w-none flex flex-col p-6"
          style={{ contain: "layout paint" }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center justify-between">
              <span>Related Notes for Shot: {shotName}</span>
              <div className="flex items-center gap-2 mr-8">
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
              </div>
            </DialogTitle>
            <DialogDescription>
              View all notes from other versions in the same shot. Click
              thumbnails or attachments to view media.
            </DialogDescription>
          </DialogHeader>

          {/* Search and filters */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search notes, authors, or versions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-10"
              />
            </div>

            {/* Author filter dropdown */}
            {availableAuthors.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    <span>
                      {authorFilter.length > 0
                        ? `${authorFilter.length} Author${authorFilter.length === 1 ? "" : "s"}`
                        : "Filter by Author"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-1">
                  <DropdownMenuLabel>Filter by Author</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {availableAuthors.map((author) => (
                    <DropdownMenuCheckboxItem
                      key={author.id}
                      checked={authorFilter.includes(author.id)}
                      onCheckedChange={(checked) => {
                        setAuthorFilter((prev) =>
                          checked
                            ? [...prev, author.id]
                            : prev.filter((id) => id !== author.id),
                        );
                      }}
                    >
                      {author.name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  {authorFilter.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setAuthorFilter([])}
                        className="flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Clear
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Sort dropdown */}
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
                  { field: "createdAt", label: "Date Created" },
                  { field: "updatedAt", label: "Date Updated" },
                  { field: "author", label: "Author" },
                  { field: "version", label: "Version Name" },
                ].map(({ field, label }) => (
                  <React.Fragment key={field}>
                    <DropdownMenuItem
                      onClick={() =>
                        setSortConfig({ field: field as any, direction: "asc" })
                      }
                      className={cn(
                        "flex justify-between",
                        sortConfig.field === field &&
                          sortConfig.direction === "asc" &&
                          "bg-zinc-100 dark:bg-zinc-800",
                      )}
                    >
                      {label} (Asc)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setSortConfig({
                          field: field as any,
                          direction: "desc",
                        })
                      }
                      className={cn(
                        "flex justify-between",
                        sortConfig.field === field &&
                          sortConfig.direction === "desc" &&
                          "bg-zinc-100 dark:bg-zinc-800",
                      )}
                    >
                      {label} (Desc)
                    </DropdownMenuItem>
                  </React.Fragment>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    setSortConfig({ field: "createdAt", direction: "desc" })
                  }
                >
                  Reset sorting
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Content area */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Summary */}
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
              {summaryText}
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading notes...</span>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-red-600 dark:text-red-400 mb-4">
                    {error.message}
                  </p>
                  {error.retryable && (
                    <Button onClick={handleRetry} variant="outline">
                      Try Again
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && notes.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-zinc-500 dark:text-zinc-400">
                  <p className="text-lg mb-2">No notes found</p>
                  <p className="text-sm">
                    There are no notes from other versions in shot "{shotName}".
                  </p>
                </div>
              </div>
            )}

            {/* No results state */}
            {!loading &&
              !error &&
              notes.length > 0 &&
              filteredAndSortedNotes.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-zinc-500 dark:text-zinc-400">
                    <p className="text-lg mb-2">No matching notes</p>
                    <p className="text-sm">
                      Try adjusting your search or filter criteria.
                    </p>
                  </div>
                </div>
              )}

            {/* Notes list */}
            {!loading && !error && paginatedNotes.length > 0 && (
              <div className="flex-1 relative">
                {/* Overlays are siblings of the scroll area so they don't scroll */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white/90 dark:from-black/60 to-transparent z-10"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/90 dark:from-black/60 to-transparent z-10"
                />

                {/* Scroll area */}
                <div className="absolute inset-0 overflow-auto">
                  <div className="space-y-4 pt-8 pb-8">
                    {paginatedNotes.map((note) => (
                      <ShotNoteItem
                        key={note.id}
                        note={note}
                        onThumbnailClick={handleThumbnailClick}
                        onAttachmentClick={handleAttachmentClick}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Footer with pagination controls */}
            <div className="border-t border-zinc-200 dark:border-zinc-700 mt-2">
              {paginatedNotes.length > 0 && (
                <div className="flex items-center py-2 px-2 bg-zinc-50 dark:bg-zinc-800/50">
                  {/* Left section – page size select and summary */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      Show:
                    </span>
                    <Select
                      value={pagination.pageSize.toString()}
                      onValueChange={(value) =>
                        handlePageSizeChange(parseInt(value))
                      }
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>

                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {summaryText}
                    </span>
                  </div>

                  {/* Right section – page controls */}
                  <div className="flex items-center gap-4 flex-1 justify-end">
                    {Math.ceil(pagination.totalItems / pagination.pageSize) >
                      1 && (
                      <>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          Page {pagination.currentPage} of{" "}
                          {Math.ceil(
                            pagination.totalItems / pagination.pageSize,
                          )}
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
                              Math.ceil(
                                pagination.totalItems / pagination.pageSize,
                              )
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
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Thumbnail Modal */}
      {selectedThumbnail && (
        <ThumbnailModal
          isOpen={thumbnailModalOpen}
          onClose={() => setThumbnailModalOpen(false)}
          thumbnailUrl={null}
          versionName={selectedThumbnail.versionName}
          versionNumber={selectedThumbnail.versionNumber.toString()}
          versionId={selectedThumbnail.versionId}
          thumbnailId={selectedThumbnail.thumbnailId}
        />
      )}

      {/* Attachment Viewer */}
      <NoteAttachmentViewer
        isOpen={attachmentViewerOpen}
        onClose={() => setAttachmentViewerOpen(false)}
        attachment={selectedAttachment}
      />
    </>
  );
};
