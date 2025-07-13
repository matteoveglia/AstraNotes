import { useEffect } from "react";
import { Playlist } from "@/types";
import { playlistStore } from "@/store/playlist";
import { useProjectStore } from "@/store/projectStore";

interface UseAppEventListenersParams {
  handlePlaylistSelect: (playlistId: string) => void;
  playlists: Playlist[];
  setLocalPlaylists: (playlists: Playlist[]) => void;
  loadedVersionsRef: React.MutableRefObject<Record<string, boolean>>;
  setLoadingVersions: (loading: boolean) => void;
  loadPlaylistsWithLists: (projectId?: string | null) => Promise<void>;
}

/**
 * Centralises global/non-UI event listeners previously set up in App.tsx.
 * All callbacks/state are passed in via the params object so the hook
 * remains stateless and easy to test.
 */
export function useAppEventListeners({
  handlePlaylistSelect,
  playlists,
  setLocalPlaylists,
  loadedVersionsRef,
  setLoadingVersions,
  loadPlaylistsWithLists,
}: UseAppEventListenersParams): void {
  // playlist-select → selects playlist in UI
  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ playlistId: string }>;
      handlePlaylistSelect(custom.detail.playlistId);
    };

    window.addEventListener("playlist-select", listener);
    return () => window.removeEventListener("playlist-select", listener);
  }, [handlePlaylistSelect]);

  // playlist-synced → playlist converted from local to ftrack
  useEffect(() => {
    const listener = (event: Event) => {
      const { playlistId, ftrackId } = (
        event as CustomEvent<{
          playlistId: string;
          ftrackId?: string;
          playlistName: string;
        }>
      ).detail;

      const currentPlaylists = playlists;

      if (!Array.isArray(currentPlaylists)) return;
      const index = currentPlaylists.findIndex((p) => p.id === playlistId);

      if (index >= 0) {
        const updated = [...currentPlaylists];
        updated[index] = {
          ...updated[index],
          isLocalOnly: false,
          ftrackSyncState: "synced" as const,
          ftrackId,
          versions: updated[index].versions?.map((v) => ({
            ...v,
            manuallyAdded: false,
          })),
        };
        setLocalPlaylists(updated);
      } else {
        // Fallback: reload playlists if playlist not found
        const projId = useProjectStore.getState().selectedProjectId;
        loadPlaylistsWithLists(projId).catch(() => {});
      }
    };

    window.addEventListener("playlist-synced", listener);
    return () => window.removeEventListener("playlist-synced", listener);
  }, [playlists, setLocalPlaylists, loadPlaylistsWithLists]);

  // playlist-updated emitted from playlistStore
  useEffect(() => {
    const handlePlaylistUpdate = (data: any) => {
      const { playlistId, updates } = data;
      const current = playlists;
      if (!Array.isArray(current)) return;

      const idx = current.findIndex((p) => p.id === playlistId);

      if (idx >= 0) {
        const updatedPlaylists = [...current];
        updatedPlaylists[idx] = { ...updatedPlaylists[idx], ...updates };
        setLocalPlaylists(updatedPlaylists);
      } else {
        const projId = useProjectStore.getState().selectedProjectId;
        loadPlaylistsWithLists(projId)
          .then(() => {
            delete loadedVersionsRef.current[playlistId];
            setTimeout(() => setLoadingVersions(false), 100);
          })
          .catch(() => {});
      }
    };

    playlistStore.on("playlist-updated", handlePlaylistUpdate);
    return () => {
      playlistStore.off("playlist-updated", handlePlaylistUpdate);
    };
  }, [
    playlists,
    setLocalPlaylists,
    loadPlaylistsWithLists,
    loadedVersionsRef,
    setLoadingVersions,
  ]);
}
