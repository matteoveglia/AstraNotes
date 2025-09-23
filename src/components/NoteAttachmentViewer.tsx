/**
 * @fileoverview NoteAttachmentViewer.tsx
 * Modal for previewing note attachments (images) and providing open/download options.
 */

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Image as ImageIcon, ExternalLink, Download } from "lucide-react";
import type { NoteAttachment } from "@/types/relatedNotes";
import { ftrackVersionService } from "@/services/ftrack/FtrackVersionService";
import { motion, AnimatePresence } from "motion/react";
import { open as openExternal } from "@tauri-apps/plugin-shell";

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

  const handleOpenExternal = () => {
    if (url) openExternal(url);
  };

  const handleDownload = () => {
    if (url) openExternal(url); // For now, open in browser to handle download
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate mr-4">{attachment?.name || "Attachment"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenExternal} disabled={!url} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Open
              </Button>
              <Button variant="default" size="sm" onClick={handleDownload} disabled={!url} className="flex items-center gap-2">
                <Download className="w-4 h-4" /> Download
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {attachment?.size ? `${(attachment.size / 1024).toFixed(0)} KB • ${attachment?.type}` : attachment?.type}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[300px] flex items-center justify-center relative">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-zinc-500"
              >
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
              />
            )}
            {!loading && !error && url && !isImage(attachment) && (
              <motion.div key="fallback" className="flex flex-col items-center gap-2 text-zinc-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageIcon className="w-8 h-8" />
                <p>Preview not supported. Use Open or Download.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};
