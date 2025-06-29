/**
 * @fileoverview VersionItem.tsx
 * Component for displaying a single version with thumbnail and note input.
 */

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteInput } from "@/components/NoteInput";
import { AssetVersion, NoteStatus } from "@/types";
import { motion } from "motion/react";
import { ThumbnailPreview } from "@/features/versions/components/ThumbnailPreview";
import { ThumbnailSuspense } from "@/components/ui/ThumbnailSuspense";
import { Attachment } from "@/components/NoteAttachments";

interface VersionItemProps {
  version: AssetVersion;
  isSelected: boolean;
  draftContent: string;
  labelId: string;
  noteStatus: NoteStatus;
  onSelect: () => void;
  onNoteChange: (
    content: string,
    labelId: string,
    attachments?: Attachment[],
  ) => void;
  onNoteClear: () => void;
  initialAttachments?: Attachment[];
  // Legacy props for backward compatibility (deprecated with Suspense)
  thumbnailUrl?: string;
  thumbnailLoading?: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: -10,
    transition: { duration: 0.15 },
  },
};

export const VersionItem: React.FC<VersionItemProps> = ({
  version,
  isSelected,
  draftContent,
  labelId,
  noteStatus,
  onSelect,
  onNoteChange,
  onNoteClear,
  initialAttachments = [],
  // Legacy props for backward compatibility
  thumbnailUrl,
  thumbnailLoading = false,
}) => {
  const [localAttachments, setLocalAttachments] =
    useState<Attachment[]>(initialAttachments);

  useEffect(() => {
    setLocalAttachments(initialAttachments);
  }, [initialAttachments]);

  const handleNoteInputSave = (
    content: string,
    labelId: string,
    attachments: Attachment[] = [],
  ) => {
    setLocalAttachments(attachments);
    onNoteChange(content, labelId, attachments);
  };

  return (
    <motion.div
      className={`rounded-lg border ${isSelected ? "border-primary" : "border-border"} overflow-hidden`}
      variants={itemVariants}
      layout
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Card className="h-full">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-none w-full md:w-48">
            <ThumbnailSuspense
              thumbnailId={version.thumbnailId}
              alt={`Thumbnail for ${version.name}`}
              className="w-full aspect-video rounded-md cursor-pointer"
              onClick={onSelect}
            />
            <div className="mt-2 text-sm">
              <div className="font-medium truncate" title={version.name}>
                {version.name}
              </div>
              <div className="text-muted-foreground">
                Version {version.version}
              </div>
            </div>
          </div>

          <div className="flex-1">
            <NoteInput
              versionName={version.name}
              versionNumber={version.version.toString()}
              thumbnailUrl={thumbnailUrl} // Legacy fallback, will be replaced by Suspense thumbnail
              thumbnailId={version.thumbnailId}
              initialContent={draftContent}
              initialLabelId={labelId}
              initialAttachments={localAttachments}
              status={noteStatus}
              onSave={handleNoteInputSave}
              onClear={onNoteClear}
              onSelectToggle={onSelect}
              selected={isSelected}
              assetVersionId={version.id}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
