/**
 * @fileoverview SearchPanel.tsx
 * Component for searching and adding versions to a playlist.
 * Provides version search functionality with multi-selection and management of manually added versions.
 */

import React from "react";
import { VersionSearch } from "@/components/VersionSearch";
import { AssetVersion, Playlist } from "@/types";

interface SearchPanelProps {
  onVersionSelect: (version: AssetVersion) => void;
  onVersionsSelect: (versions: AssetVersion[]) => void;
  onClearAdded: () => void;
  hasManuallyAddedVersions: boolean;
  isQuickNotes: boolean;
  currentVersions: AssetVersion[]; // Current versions in the playlist
  onPlaylistCreated?: (playlist: Playlist) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  onVersionSelect,
  onVersionsSelect,
  onClearAdded,
  hasManuallyAddedVersions,
  isQuickNotes,
  currentVersions,
  onPlaylistCreated,
}) => {
  return (
    <div className="p-3 border-t bg-background shadow-md">
      <div className="space-y-4">
        <VersionSearch
          onVersionSelect={onVersionSelect}
          onVersionsSelect={onVersionsSelect}
          onClearAdded={onClearAdded}
          hasManuallyAddedVersions={hasManuallyAddedVersions}
          isQuickNotes={isQuickNotes}
          currentVersions={currentVersions}
          onPlaylistCreated={onPlaylistCreated}
        />
      </div>
    </div>
  );
};
