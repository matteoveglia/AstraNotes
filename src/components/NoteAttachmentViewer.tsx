/**
 * @fileoverview NoteAttachmentViewer.tsx
 * Modal for previewing note attachments (images) and providing open/download options.
 */

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Image as ImageIcon, Download } from "lucide-react";
import type { NoteAttachment } from "@/types/relatedNotes";
import { ftrackVersionService } from "@/services/ftrack/FtrackVersionService";
import { motion, AnimatePresence } from "motion/react";
import { fetch } from "@tauri-apps/plugin-http";
import { writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";

interface NoteAttachmentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: NoteAttachment | null;
}

export const NoteAttachmentViewer: React.FC<NoteAttachmentViewerProps> = ({
  isOpen,
  onClose,
  attachment,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isOpen || !attachment) return;
      setLoading(true);
      setError(null);
      setUrl(null);
      try {
        const u = await ftrackVersionService.getComponentUrl(attachment.id);
        setUrl(u);
        // Start image-loading spinner for images
        if (isImage(attachment)) {
          setImageLoading(true);
        }
      } catch (e) {
        console.error("[NoteAttachmentViewer] Failed to get component URL", e);
        setError("Failed to load attachment");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, attachment?.id]);

  const isImage = (att?: NoteAttachment | null) => {
    if (!att) return false;
    const t = att.type?.toLowerCase() || "";
    return t.startsWith("image/") || [".jpg", ".jpeg", ".png", ".gif", ".webp"].some((ext) => t.endsWith(ext));
  };

  const handleDownload = async () => {
    if (!url || !attachment) return;
    setDownloading(true);
    try {
      // Determine filename (fallback to component id + extension)
      let filename = attachment.name || `attachment-${attachment.id}`;
      // Ensure extension present if we have a usable type
      if (attachment.type) {
        const type = attachment.type.toLowerCase();
        // If type looks like an extension (starts with '.') or a mime type
        const ext = type.startsWith('.')
          ? type
          : type.startsWith('image/')
            ? `.${type.split('/')[1]}`
            : type === 'application/pdf'
              ? '.pdf'
              : '';
        if (ext && !filename.toLowerCase().endsWith(ext)) {
          filename += ext;
        }
      }
      const downloads = await downloadDir();
      const filePath = await join(downloads, filename);

      // Fetch binary data via Tauri HTTP plugin
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Write to Downloads folder
      await writeFile(filePath, bytes);
      console.log(`[NoteAttachmentViewer] Saved attachment to ${filePath}`);
    } catch (e) {
      console.error("[NoteAttachmentViewer] Download failed", e);
      setError("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate mr-4">{attachment?.name || "Attachment"}</span>
            <div className="flex items-center gap-2 mr-5">
              <Button variant="default" size="sm" onClick={handleDownload} disabled={!url || downloading} className="flex items-center gap-2 ml-2">
                <Download className="w-4 h-4" /> Download
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {attachment?.size ? `${(attachment.size / 1024).toFixed(0)} KB` : ""}
            {attachment?.name ? ` • ${attachment.name}` : ""}
            {attachment?.type ? ` • ${attachment.type}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[300px] flex items-center justify-center relative">
          <AnimatePresence mode="wait">
            {(loading || (isImage(attachment) && imageLoading)) && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-zinc-500 flex items-center gap-2"
              >
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
                Loading attachment...
              </motion.div>
            )}
            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-red-500"
              >
                {error}
              </motion.div>
            )}
            {!loading && !error && url && isImage(attachment) && (
              <motion.img
                key="image"
                src={url}
                alt={attachment?.name || "Attachment"}
                className="max-h-[70vh] max-w-full object-contain rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onLoad={() => setImageLoading(false)}
              />
            )}
            {!loading && !error && url && !isImage(attachment) && (
              <motion.div key="fallback" className="flex flex-col items-center gap-2 text-zinc-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageIcon className="w-8 h-8" />
                <p>Preview not supported. Use Download.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};
