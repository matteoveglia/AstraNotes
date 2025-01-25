import React, { useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ftrackService } from "../services/ftrack";
import { AssetVersion } from "../types";
import { usePlaylistsStore } from "../store/playlistsStore";

interface VersionSearchProps {
  onClearAdded: () => void;
  onClearAll: () => void;
}

export const VersionSearch: React.FC<VersionSearchProps> = ({
  onClearAdded,
  onClearAll,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { playlists, activePlaylistId, setPlaylists } = usePlaylistsStore();
  const activePlaylist = playlists.find(p => p.id === activePlaylistId);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim() || !activePlaylist) return;

    setIsSearching(true);
    try {
      const versions = await ftrackService.searchVersions(searchTerm);
      if (versions.length > 0) {
        const existingVersionIds = new Set(activePlaylist.versions?.map(v => v.id) || []);
        const newVersions = versions.filter(v => !existingVersionIds.has(v.id));
        
        if (newVersions.length > 0) {
          const updatedPlaylist = {
            ...activePlaylist,
            versions: [...(activePlaylist.versions || []), ...newVersions]
          };
          
          setPlaylists(playlists.map(p => 
            p.id === activePlaylist.id ? updatedPlaylist : p
          ));
        }
      }
    } catch (error) {
      console.error("Failed to search versions:", error);
    } finally {
      setIsSearching(false);
      setSearchTerm("");
    }
  }, [searchTerm, playlists, activePlaylist, setPlaylists]);

  // Determine if there are any manually added versions
  const hasManuallyAddedVersions = activePlaylist?.versions?.some(v => v.manuallyAdded) ?? false;

  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder="Search for a version to add here"
        className="flex-1"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
      />
      <Button 
        variant="default" 
        size="sm" 
        onClick={handleSearch}
        disabled={isSearching || !searchTerm.trim()}
      >
        {isSearching ? "Searching..." : "Add Version"}
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onClearAdded}
        disabled={!hasManuallyAddedVersions}
      >
        Clear Added Versions
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onClearAll}
        disabled={!activePlaylist?.isQuickNotes}
      >
        Clear All Versions
      </Button>
    </div>
  );
};
