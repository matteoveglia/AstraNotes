/**
 * @fileoverview VersionGrid.tsx
 * Component for displaying a grid of versions with note inputs.
 * Handles animation and rendering of version items.
 */

import React from "react";
import { motion } from "motion/react";
import { AssetVersion, NoteStatus } from "@/types";
import { NoteInput } from "@/components/NoteInput";
import { Attachment } from "@/components/NoteAttachments";

interface VersionGridProps {
  versions: AssetVersion[];
  thumbnails: Record<string, string>;
  noteStatuses: Record<string, NoteStatus>;
  selectedVersions: string[];
  noteDrafts: Record<string, string>;
  noteLabelIds: Record<string, string>;
  noteAttachments?: Record<string, Attachment[]>;
  onSaveNote: (
    versionId: string,
    content: string,
    labelId: string,
    attachments?: Attachment[],
  ) => void;
  onClearNote: (versionId: string) => void;
  onToggleSelection: (versionId: string) => void;
}

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: -10,
    transition: { duration: 0.15 },
  },
};

export const VersionGrid: React.FC<VersionGridProps> = ({
  versions,
  thumbnails,
  noteStatuses,
  selectedVersions,
  noteDrafts,
  noteLabelIds,
  noteAttachments = {},
  onSaveNote,
  onClearNote,
  onToggleSelection,
}) => {
  if (!versions.length) {
    return (
      <div className="text-center text-gray-500 py-8">
        No versions found in this playlist
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={gridVariants}
      className="space-y-4 py-4"
    >
      {versions.map((version) => {
        const thumbnailUrl = thumbnails[version.id];

        return (
          <motion.div
            key={version.id}
            className="space-y-2"
            variants={itemVariants}
            layout
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <NoteInput
              versionName={version.name}
              versionNumber={version.version.toString()}
              thumbnailUrl={thumbnailUrl}
              status={noteStatuses[version.id] || "empty"}
              selected={selectedVersions.includes(version.id)}
              initialContent={noteDrafts[version.id]}
              initialLabelId={noteLabelIds[version.id]}
              initialAttachments={noteAttachments[version.id] || []}
              manuallyAdded={version.manuallyAdded}
              onSave={(
                content: string,
                labelId: string,
                attachments?: Attachment[],
              ) => onSaveNote(version.id, content, labelId, attachments)}
              onClear={() => onClearNote(version.id)}
              onSelectToggle={() => onToggleSelection(version.id)}
              assetVersionId={version.id}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
};
