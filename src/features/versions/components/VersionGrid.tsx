/**
 * @fileoverview VersionGrid.tsx
 * Component for displaying a grid of versions with note inputs.
 * Handles animation and rendering of version items.
 */

import React, { useCallback } from "react";
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
    transition: { duration: 0.15 },
  },
};

// Define memoized version item to avoid unnecessary re-renders
interface VersionGridItemProps {
  version: AssetVersion;
  position: number; // Position in the playlist (1-based)
  thumbnailUrl?: string;
  noteStatus: NoteStatus;
  selected: boolean;
  draftContent: string;
  labelId: string;
  attachments?: Attachment[];
  onSaveNote: (
    versionId: string,
    content: string,
    labelId: string,
    attachments?: Attachment[],
  ) => void;
  onClearNote: (versionId: string) => void;
  onToggleSelection: (versionId: string) => void;
}
const VersionGridItem: React.FC<VersionGridItemProps> = React.memo(
  ({
    version,
    position,
    thumbnailUrl,
    noteStatus,
    selected,
    draftContent,
    labelId,
    attachments = [],
    onSaveNote,
    onClearNote,
    onToggleSelection,
  }) => {
    const handleSave = useCallback(
      (content: string, labelId: string, attachmentsArg?: Attachment[]) =>
        onSaveNote(version.id, content, labelId, attachmentsArg),
      [onSaveNote],
    );
    const handleClear = useCallback(
      () => onClearNote(version.id),
      [onClearNote],
    );
    const handleToggle = useCallback(
      () => onToggleSelection(version.id),
      [onToggleSelection],
    );

    return (
      <motion.div
        key={version.id}
        className="space-y-5"
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
          status={noteStatus}
          selected={selected}
          initialContent={draftContent}
          initialLabelId={labelId}
          initialAttachments={attachments}
          onSave={handleSave}
          onClear={handleClear}
          onSelectToggle={handleToggle}
          manuallyAdded={version.manuallyAdded}
          assetVersionId={version.id}
          position={position}
        />
      </motion.div>
    );
  },
);

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
  // Memoize handlers to keep stable references for VersionGridItem
  const memoizedOnSaveNote = useCallback(
    (
      versionId: string,
      content: string,
      labelId: string,
      attachments?: Attachment[],
    ) => onSaveNote(versionId, content, labelId, attachments),
    [onSaveNote],
  );
  const memoizedOnClearNote = useCallback(
    (versionId: string) => onClearNote(versionId),
    [onClearNote],
  );
  const memoizedOnToggleSelection = useCallback(
    (versionId: string) => onToggleSelection(versionId),
    [onToggleSelection],
  );

  if (!versions.length) {
    return (
      <div className="text-center text-zinc-500 py-8">
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
      className="space-y-5 py-5"
    >
      {versions.map((version, index) => (
        <VersionGridItem
          key={version.id}
          version={version}
          position={index + 1}
          thumbnailUrl={thumbnails[version.id]}
          noteStatus={noteStatuses[version.id] || "empty"}
          selected={selectedVersions.includes(version.id)}
          draftContent={noteDrafts[version.id]}
          labelId={noteLabelIds[version.id]}
          attachments={noteAttachments[version.id]}
          onSaveNote={memoizedOnSaveNote}
          onClearNote={memoizedOnClearNote}
          onToggleSelection={memoizedOnToggleSelection}
        />
      ))}
    </motion.div>
  );
};
