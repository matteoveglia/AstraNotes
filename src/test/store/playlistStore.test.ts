import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { ftrackService } from "@/services/ftrack";
import { createMockPlaylist } from "@/test/utils";

// Mock only getPlaylists on ftrackService
vi.mock("@/services/ftrack", () => ({
  ftrackService: {
    getPlaylists: vi.fn(),
  },
}));

let initialState: ReturnType<typeof usePlaylistsStore.getState>;

beforeAll(() => {
  // Snapshot the initial state for resetting between tests
  initialState = { ...usePlaylistsStore.getState() };
});

beforeEach(() => {
  // Reset the store to its initial state (merge, not replace)
  usePlaylistsStore.setState((state) => ({ ...state, ...initialState }));
  vi.clearAllMocks();
});

describe("usePlaylistsStore", () => {
  it("should have default initial state", () => {
    const state = usePlaylistsStore.getState();
    expect(Array.isArray(state.playlists)).toBe(true);
    expect(state.playlists[0].id).toBe("quick-notes");
    expect(state.activePlaylistId).toBe("quick-notes");
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("loadPlaylists should fetch and set playlists", async () => {
    const mockPlaylist = createMockPlaylist({
      id: "p1",
      name: "Playlist 1",
      title: "Playlist 1",
      notes: [],
    });
    const mockPlaylists = [mockPlaylist];
    (ftrackService.getPlaylists as any).mockResolvedValue(mockPlaylists);

    const promise = usePlaylistsStore.getState().loadPlaylists();
    // Should set loading flag immediately
    expect(usePlaylistsStore.getState().isLoading).toBe(true);

    await promise;

    const state = usePlaylistsStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    // quick-notes should be preserved alongside fetched ones
    const ids = state.playlists.map((p) => p.id);
    expect(ids).toContain("quick-notes");
    expect(ids).toContain("p1");
  });

  it("loadPlaylists should set error on failure", async () => {
    const error = new Error("Failed to load");
    (ftrackService.getPlaylists as any).mockRejectedValue(error);

    const promise = usePlaylistsStore.getState().loadPlaylists();
    expect(usePlaylistsStore.getState().isLoading).toBe(true);

    await promise;

    const state = usePlaylistsStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe(error.message);
  });

  it("updatePlaylist should replace an existing playlist", async () => {
    // Seed store with a second playlist 'p2'
    const existing = createMockPlaylist({
      id: "p2",
      name: "Old Name",
      title: "Old Name",
      notes: [],
    });
    usePlaylistsStore.setState((state) => ({
      ...state,
      playlists: [initialState.playlists[0], existing],
      activePlaylistId: "p2",
      isLoading: false,
      error: null,
    }));

    const freshPlaylist = createMockPlaylist({
      id: "p2",
      name: "New Name",
      title: "New Name",
      notes: [],
    });
    const freshList = [freshPlaylist];
    (ftrackService.getPlaylists as any).mockResolvedValue(freshList);

    await usePlaylistsStore.getState().updatePlaylist("p2");

    const state = usePlaylistsStore.getState();
    const updated = state.playlists.find((p) => p.id === "p2");
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("New Name");
  });

  it("updatePlaylist should do nothing for quick-notes", async () => {
    (ftrackService.getPlaylists as any).mockResolvedValue([]);

    await usePlaylistsStore.getState().updatePlaylist("quick-notes");

    const state = usePlaylistsStore.getState();
    expect(state.error).toBeNull();
    // playlist count unchanged
    expect(state.playlists.length).toBe(initialState.playlists.length);
  });

  it("updatePlaylist should not remove a non-existent playlist", async () => {
    const existing = createMockPlaylist({
      id: "p3",
      name: "P3",
      title: "P3",
      notes: [],
    });
    usePlaylistsStore.setState((state) => ({
      ...state,
      playlists: [initialState.playlists[0], existing],
      activePlaylistId: "p3",
      isLoading: false,
      error: null,
    }));

    const otherPlaylist = createMockPlaylist({
      id: "other",
      name: "Other",
      title: "Other",
      notes: [],
    });
    const otherList = [otherPlaylist];
    (ftrackService.getPlaylists as any).mockResolvedValue(otherList);

    await usePlaylistsStore.getState().updatePlaylist("p3");

    const state = usePlaylistsStore.getState();
    // 'p3' should still be present
    expect(state.playlists.some((p) => p.id === "p3")).toBe(true);
  });
});
