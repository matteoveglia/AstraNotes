/**
 * @fileoverview SearchPanel.tsx
 * Component for searching and adding versions to a playlist.
 * Provides version search functionality and management of manually added versions.
 */

import React from "react";
import { VersionSearch } from "@/components/VersionSearch";
import { AssetVersion } from "@/types";

interface SearchPanelProps {
  onVersionSelect: (version: AssetVersion) => void;
  onClearAdded: () => void;
  hasManuallyAddedVersions: boolean;
  isQuickNotes: boolean;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  onVersionSelect,
  onClearAdded,
  hasManuallyAddedVersions,
  isQuickNotes,
}) => {
  return (
    <div className="p-4 border-t bg-white shadow-md">
      <VersionSearch
        onVersionSelect={onVersionSelect}
        onClearAdded={onClearAdded}
        hasManuallyAddedVersions={hasManuallyAddedVersions}
        isQuickNotes={isQuickNotes}
      />
    </div>
  );
};
