/**
 * @fileoverview ThumbnailModal.tsx
 * Modal component for displaying larger versions of thumbnails.
 * Provides a responsive image viewer with close functionality.
 * @component
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface ThumbnailModalProps {
  isOpen: boolean;
  onClose: () => void;
  thumbnailUrl: string | null;
  versionName: string;
  versionNumber: string;
}

export const ThumbnailModal: React.FC<ThumbnailModalProps> = ({
  isOpen,
  onClose,
  thumbnailUrl,
  versionName,
  versionNumber,
}) => {
  if (!thumbnailUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl">
            {versionName} - v{versionNumber}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="flex items-center justify-center p-4">
          <img
            src={thumbnailUrl}
            alt={`${versionName} - v${versionNumber}`}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
