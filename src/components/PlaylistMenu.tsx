/**
 * @fileoverview PlaylistMenu.tsx
 * Dropdown menu for playlist-wide operations.
 * Includes CSV export, batch note operations, label management,
 * note clearing, thumbnail reloading, and accessibility features.
 * @component
 */

import React, { useState, useEffect } from "react";
import { Menu, Download, RefreshCw, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { ThumbnailReloadModal } from "./ThumbnailReloadModal";
import { usePlaylistsStore } from "../store/playlistsStore";
import {
  exportPlaylistNotesToCSV,
  exportPlaylistNotesToPDF,
} from "../lib/exportUtils";
import { useToast } from "./ui/toast";
import { noteClient } from "@/services/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "./MarkdownEditor";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAppModeStore } from "@/store/appModeStore";

interface PlaylistMenuProps {
  onClearAllNotes: () => void;
  onSetAllLabels: (labelId: string) => void;
  onClearAllSelections: () => void;
}

export const PlaylistMenu: React.FC<PlaylistMenuProps> = ({
  onClearAllNotes,
  onSetAllLabels,
  onClearAllSelections,
}) => {
  const [labels, setLabels] = useState<
    Array<{
      id: string;
      name: string;
      color: string;
    }>
  >([]);
  const [clearAlertOpen, setClearAlertOpen] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfSummary, setPdfSummary] = useState("");
  const [pdfScope, setPdfScope] = useState<"published" | "draft" | "both">(
    "both",
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const toast = useToast();

  const { playlists, activePlaylistId } = usePlaylistsStore();
  const appMode = useAppModeStore((state) => state.appMode);

  useEffect(() => {
    let isMounted = true;

    const fetchLabels = async () => {
      try {
        const noteLabels = await noteClient().getNoteLabels();
        if (isMounted) {
          setLabels(noteLabels);
        }
      } catch (error) {
        console.error("Failed to fetch note labels:", error);
      }
    };

    fetchLabels();
    return () => {
      isMounted = false;
    };
  }, [appMode]);

  const handleExportClick = async () => {
    if (!activePlaylistId) return;

    const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
    if (!activePlaylist) return;

    try {
      await exportPlaylistNotesToCSV(activePlaylist);

      // Format the date as YYYYMMDD for the filename
      const today = new Date();
      const dateStr =
        today.getFullYear().toString() +
        (today.getMonth() + 1).toString().padStart(2, "0") +
        today.getDate().toString().padStart(2, "0");

      const fileName = `${activePlaylist.name}_${dateStr}.csv`;

      toast.showToast(
        `Notes exported to CSV file in Downloads folder: ${fileName}`,
        "success",
      );
    } catch (error) {
      console.error("Failed to export notes:", error);
      toast.showToast("Failed to export notes to CSV", "error");
    }
  };

  const handleClearAllNotes = () => {
    setClearAlertOpen(true);
  };

  const handleConfirmClear = () => {
    onClearAllNotes();
    setClearAlertOpen(false);
    toast.showToast("All notes have been cleared", "success");
  };

  const handleReloadThumbnails = () => {
    setThumbnailModalOpen(true);
  };

  // Open PDF dialog to collect optional summary
  const handleExportPdfClick = () => {
    setPdfDialogOpen(true);
  };

  // Confirm and run PDF export
  const handleConfirmExportPdf = async () => {
    if (!activePlaylistId || isExportingPdf) return;
    const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
    if (!activePlaylist) return;

    try {
      setIsExportingPdf(true);

      const fileName = await exportPlaylistNotesToPDF(
        activePlaylist,
        pdfSummary,
        pdfScope,
      );

      toast.showToast(
        `Notes exported to PDF file in Downloads folder: ${fileName}`,
        "success",
      );

      setPdfDialogOpen(false);
      setPdfSummary("");
      setPdfScope("both");
    } catch (error) {
      console.error("Failed to export notes to PDF:", error);
      toast.showToast("Failed to export notes to PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="px-2">
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 mt-1">
          <DropdownMenuItem
            onClick={handleExportClick}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export Notes to CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleExportPdfClick}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Export Notes to PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleReloadThumbnails}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Thumbnails
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleClearAllNotes}>
            Clear All Notes
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClearAllSelections}>
            Clear Note Selections
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Set All Labels</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="p-1">
              {labels.map((label) => (
                <DropdownMenuItem
                  key={label.id}
                  onClick={() => onSetAllLabels(label.id)}
                  className="truncate mb-1 last:mb-0 cursor-pointer relative py-2 px-3 rounded-sm flex items-center select-none"
                  style={{
                    backgroundColor: label.color || "white",
                    color: getContrastColor(label.color),
                  }}
                >
                  {label.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThumbnailReloadModal
        isOpen={thumbnailModalOpen}
        onClose={() => setThumbnailModalOpen(false)}
        playlist={
          (playlists.find((p) => p.id === activePlaylistId) as any) || null
        }
      />

      <AlertDialog open={clearAlertOpen} onOpenChange={setClearAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notes?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All notes in the current playlist
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear notes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Summary Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export Notes to PDF</DialogTitle>
            <DialogDescription>
              Choose which notes to include and optionally add a summary before
              exporting your playlist to PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Optional: add a summary to include at the top of the PDF. All
              markdown is supported.
            </p>
            <MarkdownEditor
              value={pdfSummary}
              onChange={setPdfSummary}
              placeholder="Write an optional summary for this export…"
              minHeight="120px"
              disabled={isExportingPdf}
            />
            <div className="space-y-2">
              <div className="text-sm font-medium">Note Types to Export</div>
              <ToggleGroup.Root
                type="single"
                value={pdfScope}
                onValueChange={(val: string) => {
                  if (isExportingPdf) return;
                  if (val === "published" || val === "draft" || val === "both")
                    setPdfScope(val);
                }}
                className={`inline-flex items-center gap-2 ${isExportingPdf ? "opacity-60 pointer-events-none" : ""}`}
              >
                <ToggleGroup.Item
                  value="published"
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${pdfScope === "published" ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                  disabled={isExportingPdf}
                >
                  Published Only
                </ToggleGroup.Item>
                <ToggleGroup.Item
                  value="draft"
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${pdfScope === "draft" ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                  disabled={isExportingPdf}
                >
                  Draft Only
                </ToggleGroup.Item>
                <ToggleGroup.Item
                  value="both"
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${pdfScope === "both" ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                  disabled={isExportingPdf}
                >
                  Both
                </ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setPdfDialogOpen(false)}
              className="transition-colors hover:bg-secondary/80"
              disabled={isExportingPdf}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmExportPdf}
              className="gap-2 transition-colors hover:bg-primary/90"
              disabled={isExportingPdf}
              aria-busy={isExportingPdf}
            >
              {isExportingPdf ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Exporting…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" /> Export PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Helper function to determine text color based on background color
function getContrastColor(hexColor: string) {
  // Remove the # if present
  const color = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate relative luminance using sRGB
  const sRGB = [r / 255, g / 255, b / 255].map((val) => {
    if (val <= 0.03928) {
      return val / 12.92;
    }
    return Math.pow((val + 0.055) / 1.055, 2.4);
  });

  const luminance = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];

  // Use a more aggressive threshold for better contrast
  return luminance > 0.4 ? "#000000" : "#FFFFFF";
}
