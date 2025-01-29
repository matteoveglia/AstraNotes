import React, { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import { SettingsModal } from "./components/SettingsModal";
import type { Playlist } from "./types";
import { ftrackService } from "./services/ftrack";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useLabelStore } from "./store/labelStore";

export const App: React.FC = () => {
  const [openPlaylists, setOpenPlaylists] = useState<string[]>(["quick-notes"]);
  const {
    playlists,
    activePlaylistId,
    isLoading,
    error,
    loadPlaylists,
    setActivePlaylist,
    setPlaylists,
  } = usePlaylistsStore();
  const { fetchLabels } = useLabelStore();

  useEffect(() => {
    // Initialize with Quick Notes
    setPlaylists([
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
    // Load playlists and labels
    Promise.all([loadPlaylists(), fetchLabels()]);
  }, [loadPlaylists, setPlaylists, fetchLabels]);

  const handlePlaylistSelect = async (playlistId: string) => {
    setActivePlaylist(playlistId);
    if (!openPlaylists.includes(playlistId)) {
      setOpenPlaylists((prev) => [...prev, playlistId]);
    }

    // Don't load versions for Quick Notes
    if (playlistId !== "quick-notes") {
      try {
        const versions = await ftrackService.getPlaylistVersions(playlistId);
        setPlaylists(
          playlists.map((playlist) =>
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
    if (activePlaylistId === playlistId) {
      setActivePlaylist("quick-notes");
    }
  };

  const handleCloseAll = () => {
    setOpenPlaylists(["quick-notes"]);
    setActivePlaylist("quick-notes");
  };

  const handlePlaylistUpdate = (updatedPlaylist: Playlist) => {
    setPlaylists(
      playlists.map((p) => (p.id === updatedPlaylist.id ? updatedPlaylist : p)),
    );
  };

  const activePlaylistData = playlists.find((p) => p.id === activePlaylistId);

  return (
    <div className="h-screen flex flex-col">
      <TopBar>
        <SettingsModal onLoadPlaylists={loadPlaylists} />
      </TopBar>
      <div className="flex-1 flex overflow-hidden">
        <PlaylistPanel
          playlists={playlists}
          activePlaylist={activePlaylistId}
          onPlaylistSelect={handlePlaylistSelect}
          loading={isLoading}
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
          <button onClick={() => {throw new Error("This is your first error!");}}>Break the world</button>
          <OpenPlaylistsBar
            playlists={playlists.filter((p) => openPlaylists.includes(p.id))}
            activePlaylist={activePlaylistId}
            onPlaylistSelect={handlePlaylistSelect}
            onPlaylistClose={handlePlaylistClose}
            onCloseAll={handleCloseAll}
          />
        </div>
      </div>
    </div>
  );
};
