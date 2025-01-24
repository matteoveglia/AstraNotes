import React from "react";
import { Button } from "./ui/button";
import { Playlist } from "../types";
import { ftrackService } from "../services/ftrack";

interface PlaylistListProps {
  onSelect: (playlist: Playlist) => void;
  currentPlaylist: Playlist;
}

export const PlaylistList: React.FC<PlaylistListProps> = ({
  onSelect,
  currentPlaylist,
}) => {
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const loadPlaylists = async () => {
      setLoading(true);
      try {
        const fetchedPlaylists = await ftrackService.getPlaylists();
        setPlaylists(fetchedPlaylists);
      } catch (error) {
        console.error("Failed to load playlists:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPlaylists();
  }, []);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {loading ? (
        <div className="text-sm text-gray-500">Loading playlists...</div>
      ) : playlists.length === 0 ? (
        <div className="text-sm text-gray-500">No playlists found</div>
      ) : (
        playlists.map((playlist) => (
          <Button
            key={playlist.id}
            variant={playlist.id === currentPlaylist.id ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(playlist)}
          >
            {playlist.name}
          </Button>
        ))
      )}
    </div>
  );
};
