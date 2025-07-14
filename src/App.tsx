import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import type { Playlist, AssetVersion } from "@/types";
import { useWhatsNew } from "./hooks/useWhatsNew";

import { usePlaylistsStore } from "./store/playlistsStore";
import { useProjectStore } from "./store/projectStore";
import { playlistStore } from "./store/playlist";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { useThemeManager } from "./hooks/useThemeManager";
import { useAppInitializer } from "./hooks/useAppInitializer";
import { useAppEventListeners } from "./hooks/useAppEventListeners";
import { videoService } from "./services/videoService";
import { NoProjectSelectedState } from "./components/EmptyStates";
import { ftrackPlaylistService } from "./services/ftrack/FtrackPlaylistService";

const App: React.FC = () => {
  // Initialise cross-cutting hooks (moved out of this component)
  useThemeManager();
  useAppInitializer();
  const { shouldShowModal, hideModal } = useWhatsNew();

  // Theme effects have been moved to useThemeManager

  // Cleanup video cache on app unmount
  useEffect(() => {
    return () => {
      videoService.clearCache();
    };
  }, []);

  const openPlaylistIds = usePlaylistsStore((s) => s.openPlaylistIds);
  const playlistStatus = usePlaylistsStore((s) => s.playlistStatus);
  const openPlaylist = usePlaylistsStore((s) => s.openPlaylist);
  const closePlaylist = usePlaylistsStore((s) => s.closePlaylist);
  const fetchVersionsForPlaylist = usePlaylistsStore(
    (s) => s.fetchVersionsForPlaylist,
  );
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
  // fetchLabels & loadProjects are now handled inside useAppInitializer
  const { selectedProjectId, hasValidatedSelectedProject } = useProjectStore();

  // Get project-scoped Quick Notes ID
  const getQuickNotesId = () =>
    playlistStore.getQuickNotesId(selectedProjectId);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Store loaded versions to prevent reloading
  const loadedVersionsRef = useRef<Record<string, boolean>>({});

  // App initialization side-effects have been moved to useAppInitializer

  // New function to load both review sessions and lists
  const loadPlaylistsWithLists = useCallback(
    async (projectId?: string | null) => {
      console.log("loadPlaylistsWithLists called:", {
        providedProjectId: projectId,
        currentSelectedProjectId: selectedProjectId,
        hasValidatedSelectedProject,
      });

      // CRITICAL FIX: Use the provided projectId parameter instead of captured selectedProjectId to avoid race conditions
      const actualProjectId = projectId ?? selectedProjectId;

      try {
        // CRITICAL FIX: Always initialize Quick Notes first - it's a permanent special playlist
        await playlistStore.initializeQuickNotes();

        // CRITICAL FIX: Ensure Quick Notes exists in the current component state
        const currentPlaylists = usePlaylistsStore.getState().playlists;
        const quickNotesId = getQuickNotesId();
        const hasQuickNotes = currentPlaylists.some(
          (p) => p.id === quickNotesId,
        );
        if (!hasQuickNotes) {
          console.log(
            "Quick Notes missing from state, will be added by setPlaylists()",
          );
        }

        // Set Quick Notes as active if no project is selected
        if (!actualProjectId || !hasValidatedSelectedProject) {
          console.log("No validated project - showing only Quick Notes");
          const quickNotesId = getQuickNotesId();
          if (!activePlaylistId || activePlaylistId !== quickNotesId) {
            setActivePlaylist(quickNotesId);
            openPlaylist(quickNotesId);
          }
          return;
        }

        // CRITICAL FIX: Use the store's loadPlaylists which includes cleanup logic
        console.log("Using store's loadPlaylists (includes cleanup)...");
        // CRITICAL FIX: loadPlaylists() now fetches BOTH Review Sessions AND Lists with proper deduplication
        // Remove redundant second fetch that was causing duplicates
        // PROJECT FILTERING FIX: Pass actualProjectId to enable project filtering
        const loadResult = await loadPlaylists(actualProjectId);

        // CRITICAL FIX: Handle startup cleanup - if playlists were deleted, just log them (no alerts during startup)
        if (
          loadResult.deletedPlaylists &&
          loadResult.deletedPlaylists.length > 0
        ) {
          console.log(
            "🧹 [STARTUP CLEANUP] Removed orphaned playlists during app startup:",
            loadResult.deletedPlaylists.map((p) => `${p.name} (${p.id})`),
          );

          // If the active playlist was deleted during startup, redirect to Quick Notes
          if (
            activePlaylistId &&
            loadResult.deletedPlaylists.some(
              (deleted) => deleted.id === activePlaylistId,
            )
          ) {
            console.log(
              "🚨 [STARTUP CLEANUP] Active playlist was deleted during startup - redirecting to Quick Notes",
            );
            const quickNotesId = getQuickNotesId();
            setActivePlaylist(quickNotesId);
            openPlaylist(quickNotesId);
          }
        }

        console.log(
          "Playlists loaded with proper deduplication - no additional fetching needed",
        );
      } catch (error) {
        console.error("Failed to load playlists with lists:", error);
      }
    },
    [
      // CRITICAL FIX: Remove selectedProjectId from dependency array to avoid closure capture race conditions
      hasValidatedSelectedProject,
      loadPlaylists,
      setLocalPlaylists,
      setStorePlaylists,
      openPlaylist,
    ],
  );

  // Load versions when active playlist changes
  useEffect(() => {
    const loadVersionsForActivePlaylist = async () => {
      const quickNotesId = getQuickNotesId();
      // Skip if it's Quick Notes or if we've already loaded versions for this playlist
      if (
        activePlaylistId === quickNotesId ||
        (activePlaylistId && loadedVersionsRef.current[activePlaylistId])
      ) {
        // CRITICAL FIX: For Quick Notes, load versions from database only (no ftrack)
        if (
          activePlaylistId === quickNotesId &&
          !loadedVersionsRef.current[quickNotesId]
        ) {
          console.log("Loading Quick Notes versions from database only...");
          try {
            const databaseVersions =
              await playlistStore.getPlaylistVersions(quickNotesId);
            const assetVersions = databaseVersions.map((v) => ({
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
                playlist.id === quickNotesId
                  ? { ...playlist, versions: assetVersions }
                  : playlist,
              ),
            );

            loadedVersionsRef.current[quickNotesId] = true;
            console.log(
              `Quick Notes loaded ${assetVersions.length} versions from database`,
            );
          } catch (error) {
            console.error("Failed to load Quick Notes versions:", error);
          }
        }
        return;
      }

      // Skip local playlists - they already have their versions loaded from database
      const currentPlaylist = playlists.find((p) => p.id === activePlaylistId);
      if (
        currentPlaylist?.isLocalOnly ||
        activePlaylistId?.startsWith("local_")
      ) {
        console.log(
          `Skipping version loading for local playlist: ${activePlaylistId} (isLocalOnly: ${currentPlaylist?.isLocalOnly})`,
        );
        if (activePlaylistId) {
          loadedVersionsRef.current[activePlaylistId] = true;
        }
        // Clear loading state for local playlists to allow immediate content rendering
        setLoadingVersions(false);
        // Force re-render by updating state to ensure the component knows the playlist is ready
        setLocalPlaylists([...playlists]);
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

        // CRITICAL FIX: Get the playlist to extract ftrackId for API call
        const currentPlaylist = playlists.find(
          (p) => p.id === activePlaylistId,
        );
        if (!currentPlaylist?.ftrackId) {
          console.log(
            `[App] Playlist ${activePlaylistId} has no ftrackId - skipping ftrack version loading`,
          );
          // Still try to load database versions
          const mergedVersions = await playlistStore.loadAndMergeVersions(
            activePlaylistId,
            [],
          );

          setLocalPlaylists(
            playlists.map((playlist) =>
              playlist.id === activePlaylistId
                ? { ...playlist, versions: mergedVersions }
                : playlist,
            ),
          );

          if (activePlaylistId) {
            loadedVersionsRef.current[activePlaylistId] = true;
          }
          return;
        }

        // CRITICAL FIX: Use ftrackId for API call instead of database UUID
        const ftrackVersions = await ftrackPlaylistService.getPlaylistVersions(
          currentPlaylist.ftrackId,
        );

        console.log(
          `Received ${ftrackVersions.length} versions from ftrack service`,
        );

        // CRITICAL FIX: Merge with database versions to preserve manual additions and drafts
        const mergedVersions = await playlistStore.loadAndMergeVersions(
          activePlaylistId,
          ftrackVersions,
        );

        console.log(
          `Using ${mergedVersions.length} merged versions (ftrack + database)`,
        );

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
  const handleProjectChange = useCallback(
    (projectId: string | null) => {
      console.log("Project changed:", projectId);

      if (projectId) {
        // CRITICAL FIX: Pass the actual projectId parameter instead of using closure
        loadPlaylistsWithLists(projectId);
      } else {
        // Project cleared - don't load anything
        console.log("Project cleared - not loading playlists");
      }
    },
    [loadPlaylistsWithLists],
  );

  // Reload when project changes or validation completes
  useEffect(() => {
    console.log("Project state changed:", {
      selectedProjectId,
      hasValidatedSelectedProject,
    });

    if (selectedProjectId && hasValidatedSelectedProject) {
      // Only load when we have a validated project selection
      console.log("Loading playlists for project:", selectedProjectId);

      // FIX ISSUE #1: Clear playlist state immediately to prevent flash of old data
      setLocalPlaylists([]);
      setStorePlaylists([]);

      // CRITICAL FIX: Pass selectedProjectId as parameter to avoid closure capture race conditions
      loadPlaylistsWithLists(selectedProjectId);
    } else {
      // No project selected or not validated - clear project playlists but keep Quick Notes
      console.log(
        "No validated project - clearing project playlists, keeping Quick Notes",
      );

      // Keep Quick Notes in playlists
      const quickNotesId = getQuickNotesId();
      const quickNotesPlaylist = {
        id: quickNotesId,
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
      setActivePlaylist(quickNotesId); // Always set Quick Notes as active when no project
      openPlaylist(quickNotesId); // Keep Quick Notes open

      // Clear the loaded versions cache when clearing project (except Quick Notes)
      const newCache = { [quickNotesId]: true };
      loadedVersionsRef.current = newCache;
      console.log("Cleared loadedVersionsRef cache except Quick Notes");
    }
  }, [
    selectedProjectId,
    hasValidatedSelectedProject,
    loadPlaylistsWithLists,
    setLocalPlaylists,
    setStorePlaylists,
    setActivePlaylist,
    openPlaylist,
  ]);

  // Handle playlist state when project selection changes
  useEffect(() => {
    const quickNotesId = getQuickNotesId();
    const quickNotesExists = playlists.some((p) => p.isQuickNotes);

    if (selectedProjectId && hasValidatedSelectedProject) {
      // Project selected - ensure Quick Notes is in open playlists if it exists
      if (quickNotesExists && !openPlaylistIds.includes(quickNotesId)) {
        openPlaylist(quickNotesId);

        // Set Quick Notes as active if no other playlist is active
        if (!activePlaylistId) {
          setActivePlaylist(quickNotesId);
        }
      }
    } else {
      // No project selected - Quick Notes should be the only active playlist
      if (quickNotesExists) {
        if (activePlaylistId !== quickNotesId) {
          setActivePlaylist(quickNotesId);
        }
        if (
          !openPlaylistIds.includes(quickNotesId) ||
          openPlaylistIds.length > 1
        ) {
          openPlaylist(quickNotesId);
        }
      }
    }
  }, [
    selectedProjectId,
    hasValidatedSelectedProject,
    playlists,
    openPlaylistIds,
    activePlaylistId,
    setActivePlaylist,
    openPlaylist,
  ]);

  // Ensure Quick Notes is open if nothing else is
  useEffect(() => {
    if (openPlaylistIds.length === 0) {
      const quickNotesId = getQuickNotesId();
      openPlaylist(quickNotesId);
    }
  }, [openPlaylistIds, openPlaylist, getQuickNotesId]);

  const handlePlaylistSelect = async (playlistId: string) => {
    const quickNotesId = getQuickNotesId();
    openPlaylist(playlistId);
    setActivePlaylist(playlistId);
    if (
      playlistId !== quickNotesId &&
      playlistStatus[playlistId] === undefined
    ) {
      fetchVersionsForPlaylist(playlistId);
    }
  };

  // Global event listeners moved to useAppEventListeners

  // After helper callbacks are defined, wire up global event listeners
  useAppEventListeners({
    handlePlaylistSelect,
    playlists,
    setLocalPlaylists,
    loadedVersionsRef,
    setLoadingVersions,
    loadPlaylistsWithLists,
  });

  const handlePlaylistClose = (playlistId: string) => {
    const quickNotesId = getQuickNotesId();
    if (playlistId === quickNotesId) return;
    closePlaylist(playlistId);
    if (activePlaylistId === playlistId) {
      // Only switch to Quick Notes if it exists
      setActivePlaylist(quickNotesId);
    }
  };

  const handleCloseAll = () => {
    const quickNotesId = getQuickNotesId();
    openPlaylistIds
      .filter((id) => id !== quickNotesId)
      .forEach((id) => closePlaylist(id));
    setActivePlaylist(quickNotesId);
  };

  const handleMainContentPlaylistUpdate = (updatedPlaylist: Playlist) => {
    console.log("handleMainContentPlaylistUpdate called:", {
      playlistId: updatedPlaylist.id,
      playlistName: updatedPlaylist.name,
      versionsCount: updatedPlaylist.versions?.length || 0,
      isQuickNotes: updatedPlaylist.isQuickNotes,
    });

    // Safety check: ensure playlists is an array
    if (!Array.isArray(playlists)) {
      console.warn(
        "handleMainContentPlaylistUpdate: playlists is not an array:",
        typeof playlists,
        playlists,
      );
      return;
    }

    const existingIndex = playlists.findIndex(
      (p: Playlist) => p.id === updatedPlaylist.id,
    );
    if (existingIndex >= 0) {
      // Update existing playlist
      const updated = [...playlists];
      updated[existingIndex] = updatedPlaylist;
      setLocalPlaylists(updated);
      console.log("Updated existing playlist in App state");
    } else {
      // Add new playlist
      setLocalPlaylists([...playlists, updatedPlaylist]);
      console.log("Added new playlist to App state");
    }
  };

  // Auto-fetch versions for active playlist when needed
  useEffect(() => {
    const quickNotesId = getQuickNotesId();
    if (
      activePlaylistId &&
      activePlaylistId !== quickNotesId &&
      playlistStatus[activePlaylistId] === undefined
    ) {
      fetchVersionsForPlaylist(activePlaylistId);
    }
  }, [
    activePlaylistId,
    playlistStatus,
    fetchVersionsForPlaylist,
    getQuickNotesId,
  ]);

  // Get the active playlist data
  const activePlaylistData = Array.isArray(playlists)
    ? playlists.find((p) => p.id === activePlaylistId)
    : undefined;

  // Derive open playlists list from store IDs, filtered by current project
  const openPlaylists = Array.isArray(playlists)
    ? openPlaylistIds
        .map((id) => playlists.find((p) => p.id === id))
        .filter((p): p is Playlist => {
          if (!p) return false;

          // Always show Quick Notes for the current project
          if (p.isQuickNotes) {
            return p.id === getQuickNotesId();
          }

          // For other playlists, only show those from the current project
          return p.projectId === selectedProjectId;
        })
    : [];

  // Determine if we're ready to render the MainContent
  const isPlaylistReady =
    activePlaylistData &&
    (activePlaylistData.isQuickNotes ||
      playlistStatus[activePlaylistId ?? ""] !== "loading");

  const shouldShowContent =
    hasValidatedSelectedProject || selectedProjectId === null;

  // Debug logging for development only
  if (process.env.NODE_ENV === "development") {
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
    <div className="h-screen flex flex-col select-none">
      <TopBar
        onLoadPlaylists={async () => {
          // CRITICAL FIX: Get current project ID for manual reload
          const currentProjectId = useProjectStore.getState().selectedProjectId;
          await loadPlaylistsWithLists(currentProjectId);
        }}
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
          onRefresh={async () => {
            // Refresh playlists ensuring parent state synchronization
            const currentProjectId =
              useProjectStore.getState().selectedProjectId;
            await loadPlaylistsWithLists(currentProjectId);
          }}
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
                    onPlaylistUpdate={handleMainContentPlaylistUpdate}
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
                          onClick={() =>
                            loadPlaylistsWithLists(selectedProjectId)
                          }
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
            playlists={openPlaylists}
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

export default App;
