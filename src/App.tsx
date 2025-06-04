import React, { useState, useEffect, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import type { Playlist } from "@/types";
import { useWhatsNew } from "./hooks/useWhatsNew";
import { ftrackService } from "./services/ftrack";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useLabelStore } from "./store/labelStore";
import { useProjectStore } from "./store/projectStore";
import { playlistStore } from "./store/playlistStore";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { useThemeStore } from "./store/themeStore";
import { videoService } from "./services/videoService";
import { NoProjectSelectedState } from "./components/EmptyStates";

const App: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const { shouldShowModal, hideModal } = useWhatsNew();

  // sync initial OS theme and subscribe to theme changes via Window API
  useEffect(() => {
    const win = getCurrentWindow();
    // seed from current window theme
    win
      .theme()
      .then((osTheme) => {
        if (osTheme) useThemeStore.getState().setTheme(osTheme);
      })
      .catch(() => {});
    // subscribe to changes
    let unlisten: () => void;
    win
      .onThemeChanged(({ payload }) => {
        useThemeStore.getState().setTheme(payload);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // toggle Tailwind dark class
    root.classList.toggle("dark", theme === "dark");
    // update native window chrome
    getCurrentWindow()
      .setTheme(theme)
      .catch(() => {});
  }, [theme]);

  // Cleanup video cache on app unmount
  useEffect(() => {
    return () => {
      videoService.clearCache();
    };
  }, []);

  const [openPlaylists, setOpenPlaylists] = useState<string[]>(["quick-notes"]);
  const {
    playlists,
    activePlaylistId,
    isLoading,
    error,
    loadPlaylists,
    setActivePlaylist,
    setPlaylists: setLocalPlaylists,
  } = usePlaylistsStore();
  const { setPlaylists: setStorePlaylists } = usePlaylistsStore();
  const { fetchLabels } = useLabelStore();
  const { selectedProjectId, hasValidatedSelectedProject, loadProjects } = useProjectStore();
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Store loaded versions to prevent reloading
  const loadedVersionsRef = useRef<Record<string, boolean>>({
    "quick-notes": true, // Quick Notes doesn't need versions
  });

  useEffect(() => {
    // Load projects, playlists and labels - now including both review sessions and lists
    Promise.all([
      loadProjects(), // Load projects first
      loadPlaylistsWithLists(), // This will load both review sessions and lists including Quick Notes from DB
      fetchLabels(),
    ]).catch((error) => {
      console.error("Failed to initialize app:", error);
    });
  }, [loadProjects, setLocalPlaylists, fetchLabels]);

  // New function to load both review sessions and lists
  const loadPlaylistsWithLists = useCallback(async () => {
    try {
      // Initialize Quick Notes if it doesn't exist
      await playlistStore.initializeQuickNotes();
      
      // Don't load playlists if no project is selected
      if (!selectedProjectId && !hasValidatedSelectedProject) {
        const quickNotesData = await playlistStore.getPlaylist("quick-notes");
        const quickNotes = quickNotesData || {
          id: "quick-notes",
          name: "Quick Notes",
          title: "Quick Notes",
          notes: [],
          versions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isQuickNotes: true,
          lastAccessed: Date.now(),
          lastChecked: Date.now(),
          hasModifications: false,
          addedVersions: [],
          removedVersions: [],
        };
        
        setLocalPlaylists([quickNotes]);
        setStorePlaylists([]);
        return;
      }
      
      const projectFilter = selectedProjectId; // null = all projects
      
      // Get Quick Notes from database, review sessions and lists in parallel
      const [quickNotesData, reviewSessions, lists] = await Promise.all([
        playlistStore.getPlaylist("quick-notes"),
        ftrackService.getPlaylists(projectFilter),
        ftrackService.getLists(projectFilter),
      ]);

      // Use the loaded Quick Notes data or create default if not found
      const quickNotes = quickNotesData || {
        id: "quick-notes",
        name: "Quick Notes",
        title: "Quick Notes",
        notes: [],
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isQuickNotes: true,
        lastAccessed: Date.now(),
        lastChecked: Date.now(),
        hasModifications: false,
        addedVersions: [],
        removedVersions: [],
      };

      // Combine them into one array
      const allPlaylists = [
        quickNotes,
        ...reviewSessions,
        ...lists,
      ];

      console.log("Loaded all playlists:", {
        projectFilter,
        quickNotesVersionsCount: quickNotes.versions?.length || 0,
        reviewSessionsCount: reviewSessions.length,
        listsCount: lists.length,
        totalCount: allPlaylists.length,
      });

      setLocalPlaylists(allPlaylists);
      setStorePlaylists(allPlaylists.filter((p) => !p.isQuickNotes)); // Store doesn't need Quick Notes
    } catch (error) {
      console.error("Failed to load playlists with lists:", error);
    }
  }, [selectedProjectId, hasValidatedSelectedProject, setLocalPlaylists, setStorePlaylists]);

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

        console.log(`Received versions from service:`, {
          count: versions.length,
          versions: versions
            .slice(0, 3)
            .map((v) => ({ id: v.id, name: v.name, version: v.version })), // Log first 3 for brevity
        });

        setLocalPlaylists(
          playlists.map((playlist) =>
            playlist.id === activePlaylistId
              ? { ...playlist, versions }
              : playlist,
          ),
        );

        console.log(
          `Updated playlists state. Active playlist now has ${versions.length} versions`,
        );

        // Mark that we've loaded versions for this playlist
        loadedVersionsRef.current[activePlaylistId] = true;

        console.log(
          `Marked playlist ${activePlaylistId} as loaded. LoadedVersionsRef:`,
          loadedVersionsRef.current,
        );
      } catch (err) {
        console.error("Failed to load versions:", err);
      } finally {
        setLoadingVersions(false);
      }
    };

    loadVersionsForActivePlaylist();
  }, [activePlaylistId, playlists, setLocalPlaylists]);

  // Listen for project changes
  useEffect(() => {
    const handleProjectChange = () => {
      loadPlaylistsWithLists();
    };
    
    window.addEventListener('project-changed', handleProjectChange);
    return () => window.removeEventListener('project-changed', handleProjectChange);
  }, [loadPlaylistsWithLists]);

  // Reload when project changes or validation completes
  useEffect(() => {
    if (hasValidatedSelectedProject || selectedProjectId === null) {
      loadPlaylistsWithLists();
    }
  }, [selectedProjectId, hasValidatedSelectedProject, loadPlaylistsWithLists]);

  const handlePlaylistSelect = async (playlistId: string) => {
    console.log(`Selecting playlist: ${playlistId}`);
    console.log(`Current openPlaylists before:`, openPlaylists);
    setActivePlaylist(playlistId);

    // Don't modify openPlaylists for Quick Notes since it's always first
    if (playlistId === "quick-notes") {
      return;
    }

    setOpenPlaylists((prev) => {
      console.log(`Previous openPlaylists:`, prev);
      // Remove the playlist if it's already in the list
      const filtered = prev.filter((id) => id !== playlistId);
      console.log(`After filtering:`, filtered);

      // Find the index of quick-notes
      const quickNotesIndex = filtered.findIndex((id) => id === "quick-notes");
      console.log(`Quick Notes index:`, quickNotesIndex);

      if (quickNotesIndex === -1) {
        // Quick notes not found, add playlist at the beginning
        const result = [playlistId, ...filtered];
        console.log(`Quick Notes not found, result:`, result);
        return result;
      } else {
        // Insert playlist right after quick-notes
        const result = [...filtered];
        result.splice(quickNotesIndex + 1, 0, playlistId);
        console.log(`Inserted after Quick Notes, result:`, result);
        return result;
      }
    });
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
    setLocalPlaylists(
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

  const shouldShowContent = hasValidatedSelectedProject || selectedProjectId === null;

  console.log("App rendering decision:", {
    activePlaylistId,
    hasActivePlaylistData: !!activePlaylistData,
    isQuickNotes: activePlaylistData?.isQuickNotes,
    hasLoadedVersions: activePlaylistId
      ? loadedVersionsRef.current[activePlaylistId]
      : false,
    loadingVersions,
    isPlaylistReady,
    versionsCount: activePlaylistData?.versions?.length || 0,
  });

  console.log("OpenPlaylistsBar data:", {
    openPlaylists,
    filteredPlaylists: playlists
      .filter((p) => openPlaylists.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name })),
    activePlaylistId,
  });

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="h-screen flex flex-col">
          <TopBar
            onLoadPlaylists={loadPlaylists}
            onCloseAllPlaylists={handleCloseAll}
            shouldShowWhatsNew={shouldShowModal}
            onWhatsNewClose={hideModal}
          />
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
                {shouldShowContent ? (
                  isPlaylistReady ? (
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
                  )
                ) : (
                  <NoProjectSelectedState />
                )}
              </div>
              <OpenPlaylistsBar
                playlists={openPlaylists
                  .map((id) => playlists.find((p) => p.id === id))
                  .filter((p): p is Playlist => p !== undefined)}
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
