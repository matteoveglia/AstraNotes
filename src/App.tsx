import React, { useState, useEffect, useCallback } from "react";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import { SettingsModal } from "./components/SettingsModal";
import type { Playlist } from "./types";
import { ftrackService } from "./services/ftrack";

export const App: React.FC = () => {
  const [playlists, setPlaylists] = useState<Playlist[]>([
    {
      id: "quick-notes",
      name: "Quick Notes",
      title: "Quick Notes",
      notes: [],
      versions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isQuickNotes: true,
    },
  ]);
  const [activePlaylist, setActivePlaylist] = useState<string>("quick-notes");
  const [openPlaylists, setOpenPlaylists] = useState<string[]>(["quick-notes"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedPlaylists = await ftrackService.getPlaylists();
      setPlaylists((prev) => {
        // Keep the Quick Notes playlist and add the fetched ones
        const quickNotes = prev.find((p) => p.isQuickNotes);
        return quickNotes
          ? [quickNotes, ...fetchedPlaylists]
          : fetchedPlaylists;
      });
    } catch (err) {
      console.error("Failed to load playlists:", err);
      setError("Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handlePlaylistSelect = async (playlistId: string) => {
    setActivePlaylist(playlistId);
    if (!openPlaylists.includes(playlistId)) {
      setOpenPlaylists((prev) => [...prev, playlistId]);
    }

    // Don't load versions for Quick Notes
    if (playlistId !== "quick-notes") {
      try {
        const versions = await ftrackService.getPlaylistVersions(playlistId);
        setPlaylists((prev) =>
          prev.map((playlist) =>
            playlist.id === playlistId ? { ...playlist, versions } : playlist,
          ),
        );
      } catch (err) {
        console.error("Failed to load versions:", err);
      }
    }
  };

  const handlePlaylistClose = (playlistId: string) => {
    if (playlistId === "quick-notes") return;
    setOpenPlaylists((prev) => prev.filter((id) => id !== playlistId));
    if (activePlaylist === playlistId) {
      setActivePlaylist("quick-notes");
    }
  };

  const handleCloseAll = () => {
    setOpenPlaylists(["quick-notes"]);
    setActivePlaylist("quick-notes");
  };

  const handlePlaylistUpdate = (updatedPlaylist: Playlist) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === updatedPlaylist.id ? updatedPlaylist : p)),
    );
  };

  const activePlaylistData = playlists.find((p) => p.id === activePlaylist);

  return (
    <div className="h-screen flex flex-col">
      <TopBar>
        <SettingsModal onLoadPlaylists={loadPlaylists} />
      </TopBar>
      <div className="flex-1 flex overflow-hidden">
        <PlaylistPanel
          playlists={playlists}
          activePlaylist={activePlaylist}
          onPlaylistSelect={handlePlaylistSelect}
          loading={loading}
          error={error}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden">
            {activePlaylistData ? (
              <MainContent
                playlist={activePlaylistData}
                onPlaylistUpdate={handlePlaylistUpdate}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Loading playlist...
              </div>
            )}
          </div>
          <OpenPlaylistsBar
            playlists={playlists.filter((p) => openPlaylists.includes(p.id))}
            activePlaylist={activePlaylist}
            onPlaylistSelect={handlePlaylistSelect}
            onPlaylistClose={handlePlaylistClose}
            onCloseAll={handleCloseAll}
          />
        </div>
      </div>
    </div>
  );
};
