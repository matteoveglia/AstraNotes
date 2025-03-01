import React, { useState, useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import { SettingsModal } from "./components/SettingsModal";
import type { Playlist, AssetVersion } from "./types";
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
  const [loadingVersions, setLoadingVersions] = useState(false);
  
  // Store loaded versions to prevent reloading
  const loadedVersionsRef = useRef<Record<string, boolean>>({
    "quick-notes": true // Quick Notes doesn't need versions
  });

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

  // Load versions when active playlist changes
  useEffect(() => {
    const loadVersionsForActivePlaylist = async () => {
      // Skip if it's Quick Notes or if we've already loaded versions for this playlist
      if (activePlaylistId === "quick-notes" || (activePlaylistId && loadedVersionsRef.current[activePlaylistId])) {
        return;
      }
      
      setLoadingVersions(true);
      try {
        if (!activePlaylistId) {
          console.error("No active playlist ID available");
          return;
        }
        
        console.log(`Loading versions for active playlist: ${activePlaylistId}`);
        const versions = await ftrackService.getPlaylistVersions(activePlaylistId);
        setPlaylists(
          playlists.map((playlist) =>
            playlist.id === activePlaylistId ? { ...playlist, versions } : playlist,
          ),
        );
        // Mark that we've loaded versions for this playlist
        loadedVersionsRef.current[activePlaylistId] = true;
      } catch (err) {
        console.error("Failed to load versions:", err);
      } finally {
        setLoadingVersions(false);
      }
    };
    
    loadVersionsForActivePlaylist();
  }, [activePlaylistId, playlists, setPlaylists]);

  const handlePlaylistSelect = async (playlistId: string) => {
    console.log(`Selecting playlist: ${playlistId}`);
    setActivePlaylist(playlistId);
    if (!openPlaylists.includes(playlistId)) {
      setOpenPlaylists((prev) => [...prev, playlistId]);
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

  // Get the active playlist data
  const activePlaylistData = playlists.find((p) => p.id === activePlaylistId);
  
  // Determine if we're ready to render the MainContent
  const isPlaylistReady = activePlaylistData && 
    (activePlaylistData.isQuickNotes || 
    (activePlaylistId && loadedVersionsRef.current[activePlaylistId] && !loadingVersions));

  return (
    <div className="h-screen flex flex-col">
      <TopBar>
        <SettingsModal onLoadPlaylists={loadPlaylists} onCloseAllPlaylists={handleCloseAll} />
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
            {isPlaylistReady ? (
              <MainContent
                playlist={activePlaylistData}
                onPlaylistUpdate={handlePlaylistUpdate}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                {loadingVersions ? "Loading playlist versions..." : "Loading playlist..."}
              </div>
            )}
          </div>
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
