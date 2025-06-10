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
import { playlistStore } from "./store/playlist";
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

  const [openPlaylists, setOpenPlaylists] = useState<string[]>([]);
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
    // Load projects and labels - playlists will be loaded when a project is selected
    Promise.all([
      loadProjects(), // Load projects first
      fetchLabels(),
    ]).catch((error) => {
      console.error("Failed to initialize app:", error);
    });
  }, [loadProjects, fetchLabels]);

  // New function to load both review sessions and lists
  const loadPlaylistsWithLists = useCallback(async () => {
    console.log("loadPlaylistsWithLists called:", { selectedProjectId, hasValidatedSelectedProject });
    
    try {
      // CRITICAL FIX: Always initialize Quick Notes first - it's a permanent special playlist
      await playlistStore.initializeQuickNotes();
      
      // CRITICAL FIX: Ensure Quick Notes exists in the current component state
      const currentPlaylists = usePlaylistsStore.getState().playlists;
      const hasQuickNotes = currentPlaylists.some(p => p.id === 'quick-notes');
      if (!hasQuickNotes) {
        console.log('Quick Notes missing from state, will be added by setPlaylists()');
      }
      
      // Set Quick Notes as active if no project is selected
      if (!selectedProjectId || !hasValidatedSelectedProject) {
        console.log("No validated project - showing only Quick Notes");
        if (!activePlaylistId || activePlaylistId !== "quick-notes") {
          setActivePlaylist("quick-notes");
          setOpenPlaylists(["quick-notes"]);
        }
        return;
      }
      
      // CRITICAL FIX: Use the store's loadPlaylists which includes cleanup logic
      console.log("Using store's loadPlaylists (includes cleanup)...");
      await loadPlaylists();
      
      // After store loads, we need to also get Lists since store only gets Review Sessions
      const projectFilter = selectedProjectId;
      console.log("Loading additional Lists for project:", projectFilter);
      
      const lists = await ftrackService.getLists(projectFilter);
      console.log("Loaded", lists.length, "lists");
      
      // Combine store playlists with lists (deduplicate by ID)
      if (lists.length > 0) {
        const currentPlaylists = usePlaylistsStore.getState().playlists;
        
        // Create a map of existing playlist IDs to avoid duplicates
        const existingIds = new Set(currentPlaylists.map(p => p.id));
        
        // Only add Lists that aren't already in store playlists
        const newLists = lists.filter(list => !existingIds.has(list.id));
        
        console.log('Deduplication check:', {
          currentPlaylistsCount: currentPlaylists.length,
          listsFromAPI: lists.length,
          newListsToAdd: newLists.length,
          existingIds: Array.from(existingIds)
        });
        
        if (newLists.length > 0) {
          const combinedPlaylists = [...currentPlaylists, ...newLists];
          setLocalPlaylists(combinedPlaylists);
          setStorePlaylists(combinedPlaylists.filter((p) => !p.isQuickNotes));
          console.log('Added', newLists.length, 'new Lists to playlists');
        } else {
          console.log('No new Lists to add - all already exist in store');
        }
      }
      
    } catch (error) {
      console.error("Failed to load playlists with lists:", error);
    }
  }, [selectedProjectId, hasValidatedSelectedProject, loadPlaylists, setLocalPlaylists, setStorePlaylists]);

  // Load versions when active playlist changes
  useEffect(() => {
    const loadVersionsForActivePlaylist = async () => {
      // Skip if it's Quick Notes or if we've already loaded versions for this playlist
      if (
        activePlaylistId === "quick-notes" ||
        (activePlaylistId && loadedVersionsRef.current[activePlaylistId])
      ) {
        // CRITICAL FIX: For Quick Notes, load versions from database only (no ftrack)
        if (activePlaylistId === "quick-notes" && !loadedVersionsRef.current["quick-notes"]) {
          console.log('Loading Quick Notes versions from database only...');
          try {
            const databaseVersions = await playlistStore.getPlaylistVersions("quick-notes");
            const assetVersions = databaseVersions.map(v => ({
              id: v.id,
              name: v.name,
              version: v.version,
              thumbnailUrl: v.thumbnailUrl,
              thumbnailId: v.thumbnailId,
              reviewSessionObjectId: v.reviewSessionObjectId,
              createdAt: v.addedAt,
              updatedAt: v.addedAt,
              manuallyAdded: v.manuallyAdded,
              // Convert VersionEntity to AssetVersion format
              draftContent: v.draftContent,
              labelId: v.labelId,
              noteStatus: v.noteStatus,
            }));
            
            setLocalPlaylists(
              playlists.map((playlist) =>
                playlist.id === "quick-notes"
                  ? { ...playlist, versions: assetVersions }
                  : playlist,
              ),
            );
            
            loadedVersionsRef.current["quick-notes"] = true;
            console.log(`Quick Notes loaded ${assetVersions.length} versions from database`);
          } catch (error) {
            console.error('Failed to load Quick Notes versions:', error);
          }
        }
        return;
      }

      // Skip local playlists - they already have their versions loaded from database
      const currentPlaylist = playlists.find(p => p.id === activePlaylistId);
      if (currentPlaylist?.isLocalOnly || activePlaylistId?.startsWith('local_')) {
        console.log(`Skipping version loading for local playlist: ${activePlaylistId} (isLocalOnly: ${currentPlaylist?.isLocalOnly})`);
        if (activePlaylistId) {
          loadedVersionsRef.current[activePlaylistId] = true;
        }
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
        
        // CRITICAL FIX: Load ftrack versions first
        const ftrackVersions =
          await ftrackService.getPlaylistVersions(activePlaylistId);

        console.log(`Received ${ftrackVersions.length} versions from ftrack service`);

        // CRITICAL FIX: Merge with database versions to preserve manual additions and drafts
        const mergedVersions = await playlistStore.loadAndMergeVersions(
          activePlaylistId,
          ftrackVersions
        );

        console.log(`Using ${mergedVersions.length} merged versions (ftrack + database)`);

        setLocalPlaylists(
          playlists.map((playlist) =>
            playlist.id === activePlaylistId
              ? { ...playlist, versions: mergedVersions }
              : playlist,
          ),
        );

        console.log(
          `Updated playlists state. Active playlist now has ${mergedVersions.length} versions`,
        );

        // Mark that we've loaded versions for this playlist
        if (activePlaylistId) {
          loadedVersionsRef.current[activePlaylistId] = true;
        }

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

  // Handle project changes
  const handleProjectChange = useCallback((projectId: string | null) => {
    console.log("Project changed:", projectId);
    
    if (projectId) {
      // Only load playlists if a project is actually selected
      loadPlaylistsWithLists();
    } else {
      // Project cleared - don't load anything
      console.log("Project cleared - not loading playlists");
    }
  }, [loadPlaylistsWithLists]);

  // Reload when project changes or validation completes
  useEffect(() => {
    console.log("Project state changed:", { selectedProjectId, hasValidatedSelectedProject });
    
    if (selectedProjectId && hasValidatedSelectedProject) {
      // Only load when we have a validated project selection
      console.log("Loading playlists for project:", selectedProjectId);
      loadPlaylistsWithLists();
    } else {
      // No project selected or not validated - clear project playlists but keep Quick Notes
      console.log("No validated project - clearing project playlists, keeping Quick Notes");
      
      // Keep Quick Notes in playlists
      const quickNotesPlaylist = {
        id: "quick-notes",
        name: "Quick Notes",
        title: "Quick Notes",
        notes: [],
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isQuickNotes: true,
        isLocalOnly: false, // CRITICAL FIX: Quick Notes should never show as local only
      };
      
      setLocalPlaylists([quickNotesPlaylist]);
      setStorePlaylists([]); // Clear store playlists (project-specific)
      setActivePlaylist("quick-notes"); // Always set Quick Notes as active when no project
      setOpenPlaylists(["quick-notes"]); // Keep Quick Notes open
      
      // Clear the loaded versions cache when clearing project (except Quick Notes)
      const newCache = { "quick-notes": true };
      loadedVersionsRef.current = newCache;
      console.log("Cleared loadedVersionsRef cache except Quick Notes");
    }
  }, [selectedProjectId, hasValidatedSelectedProject, loadPlaylistsWithLists, setLocalPlaylists, setStorePlaylists, setActivePlaylist]);

  // Handle playlist state when project selection changes
  useEffect(() => {
    const quickNotesExists = playlists.some(p => p.isQuickNotes);
    
    if (selectedProjectId && hasValidatedSelectedProject) {
      // Project selected - ensure Quick Notes is in open playlists if it exists
      if (quickNotesExists && !openPlaylists.includes("quick-notes")) {
        setOpenPlaylists(prev => ["quick-notes", ...prev.filter(id => id !== "quick-notes")]);
        
        // Set Quick Notes as active if no other playlist is active
        if (!activePlaylistId) {
          setActivePlaylist("quick-notes");
        }
      }
    } else {
      // No project selected - Quick Notes should be the only active playlist
      if (quickNotesExists) {
        if (activePlaylistId !== "quick-notes") {
          setActivePlaylist("quick-notes");
        }
        if (!openPlaylists.includes("quick-notes") || openPlaylists.length > 1) {
          setOpenPlaylists(["quick-notes"]);
        }
      }
    }
  }, [selectedProjectId, hasValidatedSelectedProject, playlists, openPlaylists, activePlaylistId, setActivePlaylist]);

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

  // Handle custom playlist selection events from child components  
  useEffect(() => {
    const handlePlaylistSelectEvent = (event: CustomEvent) => {
      const { playlistId } = event.detail;
      console.log('Received playlist-select event:', playlistId);
      handlePlaylistSelect(playlistId);
    };

    window.addEventListener('playlist-select', handlePlaylistSelectEvent as EventListener);
    return () => {
      window.removeEventListener('playlist-select', handlePlaylistSelectEvent as EventListener);
    };
  }, [handlePlaylistSelect]);

  // Handle playlist sync completion - playlist was converted in place, just reload to get updated state
  useEffect(() => {
    const handlePlaylistSynced = (event: CustomEvent) => {
      const { playlistId, ftrackId, playlistName } = event.detail;
      console.log('Playlist synced - converted in place:', { playlistId, ftrackId, playlistName });
      
      // CRITICAL FIX: Use functional state update to get current state with safety checks
      setLocalPlaylists(currentPlaylists => {
        // Safety check: ensure currentPlaylists is an array
        if (!Array.isArray(currentPlaylists)) {
          console.warn('currentPlaylists is not an array:', currentPlaylists);
          // Force reload with proper state
          setTimeout(() => {
            loadPlaylistsWithLists();
          }, 100);
          return [];
        }
        
        const playlistIndex = currentPlaylists.findIndex(p => p && p.id === playlistId);
        
        if (playlistIndex >= 0) {
          const updatedPlaylists = [...currentPlaylists];
          updatedPlaylists[playlistIndex] = {
            ...updatedPlaylists[playlistIndex],
            isLocalOnly: false,
            ftrackSyncState: 'synced' as const,
            // Clear manually added flags from versions to remove purple borders
            versions: updatedPlaylists[playlistIndex].versions?.map(v => ({
              ...v,
              manuallyAdded: false,
            })) || [],
          };
          
          console.log('Updated synced playlist in state without full reload - no remounting!');
          return updatedPlaylists;
        } else {
          console.warn('Synced playlist not found in current state, falling back to reload');
          // Only reload if we can't find the playlist (shouldn't happen)
          setTimeout(() => {
            loadPlaylistsWithLists();
          }, 100);
          return currentPlaylists;
        }
      });
    };

    window.addEventListener('playlist-synced', handlePlaylistSynced as EventListener);
    return () => {
      window.removeEventListener('playlist-synced', handlePlaylistSynced as EventListener);
    };
  }, [loadPlaylistsWithLists]);

  const handlePlaylistClose = (playlistId: string) => {
    if (playlistId === "quick-notes") return;
    setOpenPlaylists((prev) => prev.filter((id) => id !== playlistId));
    if (activePlaylistId === playlistId) {
      // Only switch to Quick Notes if it exists
      const quickNotesExists = playlists.some(p => p.isQuickNotes);
      if (quickNotesExists) {
        setActivePlaylist("quick-notes");
      } else {
        setActivePlaylist(null);
      }
    }
  };

  const handleCloseAll = () => {
    // Only keep Quick Notes if it exists (i.e., a project is selected)
    const quickNotesExists = playlists.some(p => p.isQuickNotes);
    if (quickNotesExists) {
      setOpenPlaylists(["quick-notes"]);
      setActivePlaylist("quick-notes");
    } else {
      setOpenPlaylists([]);
      setActivePlaylist(null);
    }
  };

  const handlePlaylistUpdate = (updatedPlaylist: Playlist) => {
    console.log('handlePlaylistUpdate called:', {
      playlistId: updatedPlaylist.id,
      playlistName: updatedPlaylist.name,
      versionsCount: updatedPlaylist.versions?.length || 0,
      isQuickNotes: updatedPlaylist.isQuickNotes
    });
    
    const existingIndex = playlists.findIndex((p: Playlist) => p.id === updatedPlaylist.id);
    if (existingIndex >= 0) {
      // Update existing playlist
      const updated = [...playlists];
      updated[existingIndex] = updatedPlaylist;
      setLocalPlaylists(updated);
      console.log('Updated existing playlist in App state');
    } else {
      // Add new playlist
      setLocalPlaylists([...playlists, updatedPlaylist]);
      console.log('Added new playlist to App state');
    }
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

  // Debug logging for development only
  if (process.env.NODE_ENV === 'development') {
    console.log("App rendering decision:", {
      activePlaylistId,
      hasActivePlaylistData: !!activePlaylistData,
      isQuickNotes: activePlaylistData?.isQuickNotes,
      hasLoadedVersions: activePlaylistId
        ? !!loadedVersionsRef.current[activePlaylistId]
        : false,
      loadingVersions,
      isPlaylistReady,
      versionsCount: activePlaylistData?.versions?.length || 0,
    });
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="h-screen flex flex-col">
          <TopBar
            onLoadPlaylists={loadPlaylists}
            onCloseAllPlaylists={handleCloseAll}
            onProjectChange={handleProjectChange}
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
                          <div className="text-center">
                            {!selectedProjectId || !hasValidatedSelectedProject ? (
                              <NoProjectSelectedState />
                            ) : (
                              <p className="text-zinc-500 select-none">
                                Select a playlist to view
                              </p>
                            )}
                          </div>
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
