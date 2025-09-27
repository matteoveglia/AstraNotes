/**
 * @fileoverview QuickNotesToPlaylistButton.tsx
 * Button component for converting Quick Notes to playlists.
 * Features:
 * - Button appears when versions exist in Quick Notes
 * - Opens CreatePlaylistDialog with versions pre-populated
 * - Handles the conversion workflow
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreatePlaylistDialog } from "@/features/playlists/components/CreatePlaylistDialog";
import { AssetVersion, Playlist } from "@/types";
import { ListPlus } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";

interface QuickNotesToPlaylistButtonProps {
  versions: AssetVersion[];
  onSuccess: (playlist: Playlist) => void;
}

export function QuickNotesToPlaylistButton({
  versions,
  onSuccess,
}: QuickNotesToPlaylistButtonProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { selectedProjectId } = useProjectStore();

  const handleCreateClick = () => {
    console.log("QuickNotesToPlaylistButton: Create clicked with versions:", {
      versionsCount: versions.length,
      versions: versions.map((v) => ({ id: v.id, name: v.name })),
      selectedProjectId,
    });
    setShowCreateDialog(true);
  };

  const handleCreateSuccess = (playlist: Playlist) => {
    console.log("QuickNotesToPlaylistButton: Creation success:", {
      playlistId: playlist.id,
      playlistName: playlist.name,
      versionsInPlaylist: playlist.versions?.length || 0,
    });
    setShowCreateDialog(false);
    onSuccess(playlist);
  };

  const handleCreateClose = () => {
    setShowCreateDialog(false);
  };

  if (versions.length === 0) {
    return null;
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateClick}
              className="h-8 gap-2"
              data-onboarding-target="quick-notes-convert"
            >
              <ListPlus className="h-4 w-4" />
              Create Playlist
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Create a new playlist from these {versions.length} version
              {versions.length === 1 ? "" : "s"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CreatePlaylistDialog
        isOpen={showCreateDialog}
        onClose={handleCreateClose}
        onSuccess={handleCreateSuccess}
        preSelectedVersions={versions}
        projectId={selectedProjectId || undefined}
      />
    </>
  );
}
