/**
 * @fileoverview OpenPlaylistsBar.tsx
 * Navigation bar showing open playlists with horizontal scrolling.
 * Provides active playlist indication, individual and batch close functionality,
 * and special handling for Quick Notes playlist.
 * @component
 */

import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Playlist } from "@/types";

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
    className="justify-start group relative min-w-[120px] flex-none"
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
  activePlaylist: string | null;
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
    <div className="h-[3.5rem] border-t bg-white relative">
      {/* Fixed Close All button container with gradient fade */}
      {playlists.length > 1 && (
        <div className="absolute right-0 top-0 bottom-0 flex items-center bg-white px-4 z-10">
          <div className="absolute -left-8 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onCloseAll}
          >
            Close All
          </Button>
        </div>
      )}

      {/* Scrollable playlist container */}
      <div className="absolute left-0 right-[100px] top-0 bottom-0 overflow-x-auto">
        <div className="flex items-center gap-1 px-2 h-full">
          {playlists.map((playlist) => (
            <PlaylistTab
              key={playlist.id}
              playlist={playlist}
              isActive={
                activePlaylist !== null && playlist.id === activePlaylist
              }
              onClick={() => onPlaylistSelect(playlist.id)}
              onClose={
                playlist.isQuickNotes
                  ? undefined
                  : () => onPlaylistClose(playlist.id)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};
