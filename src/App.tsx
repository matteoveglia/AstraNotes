import React, { useState, useEffect, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TopBar } from "./components/TopBar";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { OpenPlaylistsBar } from "./components/OpenPlaylistsBar";
import { MainContent } from "./components/MainContent";
import type { Playlist, AssetVersion } from "@/types";
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
import { SyncConflictManager } from "./features/playlists/components";

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
  const { selectedProjectId, hasValidatedSelectedProject, loadProjects } =
    useProjectStore();
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
        const hasQuickNotes = currentPlaylists.some(
          (p) => p.id === "quick-notes",
        );
        if (!hasQuickNotes) {
          console.log(
            "Quick Notes missing from state, will be added by setPlaylists()",
          );
        }

        // Set Quick Notes as active if no project is selected
        if (!actualProjectId || !hasValidatedSelectedProject) {
          console.log("No validated project - showing only Quick Notes");
          if (!activePlaylistId || activePlaylistId !== "quick-notes") {
            setActivePlaylist("quick-notes");
            setOpenPlaylists(["quick-notes"]);
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
            setActivePlaylist("quick-notes");
            setOpenPlaylists(["quick-notes"]);
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
    ],
  );

  // Load versions when active playlist changes
  useEffect(() => {
    const loadVersionsForActivePlaylist = async () => {
      // Skip if it's Quick Notes or if we've already loaded versions for this playlist
      if (
        activePlaylistId === "quick-notes" ||
        (activePlaylistId && loadedVersionsRef.current[activePlaylistId])
      ) {
        // CRITICAL FIX: For Quick Notes, load versions from database only (no ftrack)
        if (
          activePlaylistId === "quick-notes" &&
          !loadedVersionsRef.current["quick-notes"]
        ) {
          console.log("Loading Quick Notes versions from database only...");
          try {
            const databaseVersions =
              await playlistStore.getPlaylistVersions("quick-notes");
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
                playlist.id === "quick-notes"
                  ? { ...playlist, versions: assetVersions }
                  : playlist,
              ),
            );

            loadedVersionsRef.current["quick-notes"] = true;
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
        const ftrackVersions = await ftrackService.getPlaylistVersions(
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
  }, [
    selectedProjectId,
    hasValidatedSelectedProject,
    loadPlaylistsWithLists,
    setLocalPlaylists,
    setStorePlaylists,
    setActivePlaylist,
  ]);

  // Handle playlist state when project selection changes
  useEffect(() => {
    const quickNotesExists = playlists.some((p) => p.isQuickNotes);

    if (selectedProjectId && hasValidatedSelectedProject) {
      // Project selected - ensure Quick Notes is in open playlists if it exists
      if (quickNotesExists && !openPlaylists.includes("quick-notes")) {
        setOpenPlaylists((prev) => [
          "quick-notes",
          ...prev.filter((id) => id !== "quick-notes"),
        ]);

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
        if (
          !openPlaylists.includes("quick-notes") ||
          openPlaylists.length > 1
        ) {
          setOpenPlaylists(["quick-notes"]);
        }
      }
    }
  }, [
    selectedProjectId,
    hasValidatedSelectedProject,
    playlists,
    openPlaylists,
    activePlaylistId,
    setActivePlaylist,
  ]);

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
      console.log("Received playlist-select event:", playlistId);
      handlePlaylistSelect(playlistId);
    };

    window.addEventListener(
      "playlist-select",
      handlePlaylistSelectEvent as EventListener,
    );
    return () => {
      window.removeEventListener(
        "playlist-select",
        handlePlaylistSelectEvent as EventListener,
      );
    };
  }, [handlePlaylistSelect]);

  // Handle playlist sync completion - playlist was converted in place, just reload to get updated state
  useEffect(() => {
    const handlePlaylistSynced = (event: CustomEvent) => {
      const { playlistId, ftrackId, playlistName } = event.detail;
      console.log("Playlist synced - converted in place:", {
        playlistId,
        ftrackId,
        playlistName,
      });

      // CRITICAL FIX: Use direct state update with current playlists
      const currentPlaylists = playlists;

      // Safety check: ensure currentPlaylists is an array
      if (!Array.isArray(currentPlaylists)) {
        console.warn("currentPlaylists is not an array:", currentPlaylists);
        // Force reload with proper state
        setTimeout(() => {
          // CRITICAL FIX: Get current project ID for reload
          const currentProjectId = useProjectStore.getState().selectedProjectId;
          loadPlaylistsWithLists(currentProjectId);
        }, 100);
        return;
      }

      const playlistIndex = currentPlaylists.findIndex(
        (p: Playlist) => p && p.id === playlistId,
      );

      if (playlistIndex >= 0) {
        const updatedPlaylists = [...currentPlaylists];
        updatedPlaylists[playlistIndex] = {
          ...updatedPlaylists[playlistIndex],
          isLocalOnly: false,
          ftrackSyncState: "synced" as const,
          // CRITICAL FIX: Include ftrackId from sync event for refresh functionality
          ftrackId: ftrackId,
          // Clear manually added flags from versions to remove purple borders
          versions:
            updatedPlaylists[playlistIndex].versions?.map(
              (v: AssetVersion) => ({
                ...v,
                manuallyAdded: false,
              }),
            ) || [],
        };

        console.log(
          "Updated synced playlist in state without full reload - no remounting!",
        );
        setLocalPlaylists(updatedPlaylists);
      } else {
        console.warn(
          "Synced playlist not found in current state, falling back to reload",
        );
        // Only reload if we can't find the playlist (shouldn't happen)
        setTimeout(() => {
          // CRITICAL FIX: Get current project ID for reload
          const currentProjectId = useProjectStore.getState().selectedProjectId;
          loadPlaylistsWithLists(currentProjectId);
        }, 100);
      }
    };

    window.addEventListener(
      "playlist-synced",
      handlePlaylistSynced as EventListener,
    );
    return () => {
      window.removeEventListener(
        "playlist-synced",
        handlePlaylistSynced as EventListener,
      );
    };
  }, [loadPlaylistsWithLists]);

  // Handle playlist updates (like name changes) from PlaylistStore
  useEffect(() => {
    const handlePlaylistUpdate = (data: any) => {
      const { playlistId, updates } = data;
      console.debug("🔄 [App] Received playlist-updated event:", {
        playlistId,
        updates,
      });

      // Get current playlists and update them
      const currentPlaylists = playlists;

      // Safety check: ensure currentPlaylists is an array
      if (!Array.isArray(currentPlaylists)) {
        console.warn(
          "🔄 [App] currentPlaylists is not an array:",
          typeof currentPlaylists,
          currentPlaylists,
        );
        return; // Don't proceed if playlists is invalid
      }

      console.debug(
        "🔄 [App] Current playlists before update:",
        currentPlaylists.map((p) => ({ id: p.id, name: p.name })),
      );

      const playlistIndex = currentPlaylists.findIndex(
        (p: Playlist) => p && p.id === playlistId,
      );

      if (playlistIndex >= 0) {
        const updatedPlaylists = [...currentPlaylists];
        const oldPlaylist = updatedPlaylists[playlistIndex];
        updatedPlaylists[playlistIndex] = {
          ...updatedPlaylists[playlistIndex],
          ...updates,
        };

        console.debug(
          `🔄 [App] Updated playlist "${playlistId}" in UI state:`,
          {
            before: { name: oldPlaylist.name },
            after: { name: updatedPlaylists[playlistIndex].name },
            updates,
          },
        );
        console.debug(
          "🔄 [App] All playlists after update:",
          updatedPlaylists.map((p) => ({ id: p.id, name: p.name })),
        );

        // Update the store with the new array
        setLocalPlaylists(updatedPlaylists);
      } else {
        console.warn(
          `🔄 [App] Playlist "${playlistId}" not found in current state for update`,
        );
        console.debug(
          "🔄 [App] Available playlist IDs:",
          currentPlaylists.map((p) => p.id),
        );

        // If the playlist is not found, it might be a newly created playlist that hasn't been loaded into UI yet
        // Reload playlists to pick up any new playlists
        console.debug(
          "🔄 [App] Reloading playlists to pick up missing playlist",
        );
        const currentProjectId = useProjectStore.getState().selectedProjectId;
        loadPlaylistsWithLists(currentProjectId)
          .then(() => {
            console.debug(
              "🔄 [App] Playlists reloaded after missing playlist update",
            );

            // Reset the loaded versions flag for this playlist to force version reload
            // This ensures that when the playlist status changes (e.g., from local to synced),
            // the versions are reloaded to reflect changes like manuallyAdded flags
            console.debug(
              "🔄 [App] Resetting loaded versions flag for playlist:",
              playlistId,
            );
            delete loadedVersionsRef.current[playlistId];

            // If this playlist is currently active, the useEffect will automatically reload versions
            // because loadedVersionsRef.current[playlistId] is now undefined

            // Force a small state update to ensure React re-renders with the fresh playlist data
            setTimeout(() => {
              console.debug(
                "🔄 [App] Triggering state refresh to ensure UI updates",
              );
              // This will trigger a re-render and the version loading effect
              setLoadingVersions(false);
            }, 100);
          })
          .catch((error) => {
            console.error(
              "🔄 [App] Failed to reload playlists after missing playlist update:",
              error,
            );
          });
      }
    };

    console.debug("🔄 [App] Setting up playlist-updated event listener");
    // Listen for playlist updates from the modular store
    playlistStore.on("playlist-updated", handlePlaylistUpdate);

    return () => {
      console.debug("🔄 [App] Removing playlist-updated event listener");
      playlistStore.off("playlist-updated", handlePlaylistUpdate);
    };
  }, [setLocalPlaylists, loadPlaylistsWithLists]);

  const handlePlaylistClose = (playlistId: string) => {
    if (playlistId === "quick-notes") return;
    setOpenPlaylists((prev) => prev.filter((id) => id !== playlistId));
    if (activePlaylistId === playlistId) {
      // Only switch to Quick Notes if it exists
      const quickNotesExists =
        Array.isArray(playlists) && playlists.some((p) => p.isQuickNotes);
      if (quickNotesExists) {
        setActivePlaylist("quick-notes");
      } else {
        setActivePlaylist(null);
      }
    }
  };

  const handleCloseAll = () => {
    // Only keep Quick Notes if it exists (i.e., a project is selected)
    const quickNotesExists =
      Array.isArray(playlists) && playlists.some((p) => p.isQuickNotes);
    if (quickNotesExists) {
      setOpenPlaylists(["quick-notes"]);
      setActivePlaylist("quick-notes");
    } else {
      setOpenPlaylists([]);
      setActivePlaylist(null);
    }
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

  // Get the active playlist data
  const activePlaylistData = Array.isArray(playlists)
    ? playlists.find((p) => p.id === activePlaylistId)
    : undefined;

  // Determine if we're ready to render the MainContent
  const isPlaylistReady =
    activePlaylistData &&
    (activePlaylistData.isQuickNotes ||
      (activePlaylistId &&
        loadedVersionsRef.current[activePlaylistId] &&
        !loadingVersions));

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
    <ToastProvider>
      <SyncConflictManager />
      <ErrorBoundary>
        <div className="h-screen flex flex-col select-none">
          <TopBar
            onLoadPlaylists={async () => {
              // CRITICAL FIX: Get current project ID for manual reload
              const currentProjectId =
                useProjectStore.getState().selectedProjectId;
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
                            {!selectedProjectId ||
                            !hasValidatedSelectedProject ? (
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
                  .map((id) =>
                    Array.isArray(playlists)
                      ? playlists.find((p) => p.id === id)
                      : undefined,
                  )
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
