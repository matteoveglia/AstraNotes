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
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl">
            {versionName} - v{versionNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center">
          <img
            src={thumbnailUrl}
            alt={`${versionName} - v${versionNumber}`}
            className="max-h-[200vh] min-h-96 max-w-full object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
