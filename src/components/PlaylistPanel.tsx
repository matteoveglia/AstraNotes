import React from 'react';
import type { Playlist } from '../types';
import { Loader2, AlertCircle } from 'lucide-react';

interface PlaylistItemProps {
  playlist: Playlist;
  isActive: boolean;
  onClick: () => void;
}

const PlaylistItem: React.FC<PlaylistItemProps> = ({ playlist, isActive, onClick }) => (
  <div
    className={`p-2 rounded cursor-pointer mb-1 ${
      isActive ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'
    }`}
    onClick={onClick}
  >
    {playlist.title}
  </div>
);

interface PlaylistPanelProps {
  playlists: Playlist[];
  activePlaylist: string;
  onPlaylistSelect: (playlistId: string) => void;
  loading: boolean;
  error: string | null;
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  playlists,
  activePlaylist,
  onPlaylistSelect,
  loading,
  error,
}) => {
  return (
    <div className="w-72 border-r p-4 overflow-y-auto">
      {loading ? (
        <div className="flex items-center justify-center text-gray-500 h-full">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading playlists...</span>
        </div>
      ) : error ? (
        <div className="flex items-center text-red-500 p-2 bg-red-50 rounded">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      ) : (
        playlists.map((playlist) => (
          <PlaylistItem
            key={playlist.id}
            playlist={playlist}
            isActive={playlist.id === activePlaylist}
            onClick={() => onPlaylistSelect(playlist.id)}
          />
        ))
      )}
    </div>
  );
};
