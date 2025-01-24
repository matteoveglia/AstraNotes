import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Playlist } from "../types";

interface PlaylistTabProps {
  playlist: Playlist;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}

const PlaylistTab: React.FC<PlaylistTabProps> = ({
  playlist,
  isActive,
  onClick,
  onClose,
}) => (
  <Button
    variant={isActive ? "default" : "ghost"}
    className="justify-start group relative min-w-[120px]"
    onClick={onClick}
  >
    <span className="truncate mr-6">{playlist.title}</span>
    {!playlist.isQuickNotes && onClose && (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        <X className="h-4 w-4" />
      </div>
    )}
  </Button>
);

interface OpenPlaylistsBarProps {
  playlists: Playlist[];
  activePlaylist: string;
  onPlaylistSelect: (playlistId: string) => void;
  onPlaylistClose: (playlistId: string) => void;
  onCloseAll: () => void;
}

export const OpenPlaylistsBar: React.FC<OpenPlaylistsBarProps> = ({
  playlists,
  activePlaylist,
  onPlaylistSelect,
  onPlaylistClose,
  onCloseAll,
}) => {
  return (
    <div className="h-[3.5rem] border-t bg-white flex items-center justify-between px-2 rounded-none">
      <div className="flex gap-1 overflow-x-auto">
        {playlists.map((playlist) => (
          <PlaylistTab
            key={playlist.id}
            playlist={playlist}
            isActive={playlist.id === activePlaylist}
            onClick={() => onPlaylistSelect(playlist.id)}
            onClose={
              playlist.isQuickNotes
                ? undefined
                : () => onPlaylistClose(playlist.id)
            }
          />
        ))}
      </div>
      {playlists.length > 1 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={onCloseAll}
        >
          Close All
        </Button>
      )}
    </div>
  );
};
