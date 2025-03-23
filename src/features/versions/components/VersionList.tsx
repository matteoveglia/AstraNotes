/**
 * @fileoverview VersionList.tsx
 * Component for displaying a list of versions with animations and filtering.
 */

import React, { useMemo } from "react";
import { AssetVersion, NoteStatus } from "@/types";
import { VersionItem } from "./VersionItem";
import { motion } from "motion/react";
import { Attachment } from "@/components/NoteAttachments";

interface VersionListProps {
  versions: AssetVersion[];
  selectedVersions: string[];
  thumbnails: Record<string, string>;
  loadingStatus: Record<string, string>;
  noteDrafts: Record<string, string>;
  noteLabelIds: Record<string, string>;
  noteStatuses: Record<string, NoteStatus>;
  noteAttachments?: Record<string, Attachment[]>;
  onVersionSelect: (versionId: string) => void;
  onNoteChange: (versionId: string, content: string, labelId: string, attachments?: Attachment[]) => void;
  onNoteClear: (versionId: string) => void;
  searchQuery?: string;
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

export const VersionList: React.FC<VersionListProps> = ({
  versions,
  selectedVersions,
  thumbnails,
  loadingStatus,
  noteDrafts,
  noteLabelIds,
  noteStatuses,
  noteAttachments = {},
  onVersionSelect,
  onNoteChange,
  onNoteClear,
  searchQuery = "",
}) => {
  // Filter versions based on search query if provided
  const filteredVersions = useMemo(() => {
    if (!searchQuery) return versions;

    const query = searchQuery.toLowerCase();
    return versions.filter(
      (version) =>
        version.name.toLowerCase().includes(query) ||
        version.id.toLowerCase().includes(query) ||
        (version.version && version.version.toString().includes(query)),
    );
  }, [versions, searchQuery]);

  // Sort versions by name and version number
  const sortedVersions = useMemo(() => {
    return [...filteredVersions].sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by version number
      return a.version - b.version;
    });
  }, [filteredVersions]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={gridVariants}
      className="space-y-4 py-4"
    >
      {sortedVersions.map((version) => (
        <VersionItem
          key={version.id}
          version={version}
          isSelected={selectedVersions.includes(version.id)}
          thumbnailUrl={thumbnails[version.id]}
          thumbnailLoading={loadingStatus[version.id] === "loading"}
          draftContent={noteDrafts[version.id] || ""}
          labelId={noteLabelIds[version.id] || ""}
          noteStatus={(noteStatuses[version.id] || "empty") as NoteStatus}
          initialAttachments={noteAttachments[version.id] || []}
          onSelect={() => onVersionSelect(version.id)}
          onNoteChange={(content, labelId, attachments) =>
            onNoteChange(version.id, content, labelId, attachments)
          }
          onNoteClear={() => onNoteClear(version.id)}
        />
      ))}

      {sortedVersions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery
            ? "No versions match your search query"
            : "No versions available"}
        </div>
      )}
    </motion.div>
  );
};
