import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import { SettingsModal } from "./components/SettingsModal";
import type { Playlist, AssetVersion } from "@/types";
import { ftrackService } from "./services/ftrack";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useLabelStore } from "./store/labelStore";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { useThemeStore } from "./store/themeStore";

const App: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // inform Tauri of theme change
    invoke("plugin:theme|set_theme", { theme }).catch(() => {
      // ignore if not running under Tauri
    });
  }, [theme]);

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
    "quick-notes": true, // Quick Notes doesn't need versions
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
      if (
        activePlaylistId === "quick-notes" ||
        (activePlaylistId && loadedVersionsRef.current[activePlaylistId])
      ) {
        return;
      }

      setLoadingVersions(true);
      try {
        if (!activePlaylistId) {
          console.error("No active playlist ID available");
          return;
        }

        console.log(
          `Loading versions for active playlist: ${activePlaylistId}`,
        );
        const versions =
          await ftrackService.getPlaylistVersions(activePlaylistId);
        setPlaylists(
          playlists.map((playlist) =>
            playlist.id === activePlaylistId
              ? { ...playlist, versions }
              : playlist,
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
  const isPlaylistReady =
    activePlaylistData &&
    (activePlaylistData.isQuickNotes ||
      (activePlaylistId &&
        loadedVersionsRef.current[activePlaylistId] &&
        !loadingVersions));

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="h-screen flex flex-col">
          <TopBar>
            <SettingsModal
              onLoadPlaylists={loadPlaylists}
              onCloseAllPlaylists={handleCloseAll}
            />
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
                  <ErrorBoundary
                    fallback={
                      <div className="h-full flex flex-col items-center justify-center p-6">
                        <h3 className="text-xl font-semibold text-red-600 mb-2">
                          Error loading content
                        </h3>
                        <p className="text-zinc-700 mb-4">
                          Failed to load playlist content
                        </p>
                        <button
                          onClick={() => window.location.reload()}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
                        >
                          Try again
                        </button>
                      </div>
                    }
                  >
                    <MainContent
                      playlist={activePlaylistData}
                      onPlaylistUpdate={handlePlaylistUpdate}
                    />
                  </ErrorBoundary>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      {error ? (
                        <>
                          <p className="text-red-500 text-xl mb-2">
                            Error loading playlists
                          </p>
                          <p className="text-zinc-600 mb-4">{error}</p>
                          <button
                            onClick={loadPlaylists}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Try again
                          </button>
                        </>
                      ) : isLoading ? (
                        <p className="text-zinc-500">Loading playlists...</p>
                      ) : (
                        <p className="text-zinc-500">
                          Select a playlist to view
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <OpenPlaylistsBar
                playlists={playlists.filter((p) =>
                  openPlaylists.includes(p.id),
                )}
                activePlaylist={activePlaylistId}
                onPlaylistSelect={handlePlaylistSelect}
                onPlaylistClose={handlePlaylistClose}
                onCloseAll={handleCloseAll}
              />
            </div>
          </div>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
};

export default App;
