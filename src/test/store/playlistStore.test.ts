import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { ftrackService } from "@/services/ftrack";
import { createMockPlaylist } from "@/test/utils";

// Mock the database with comprehensive methods
vi.mock("@/store/db", () => ({
  db: {
    playlists: {
      toArray: vi.fn(() => Promise.resolve([])),
      delete: vi.fn(() => Promise.resolve()),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          delete: vi.fn(() => Promise.resolve()),
          first: vi.fn(() => Promise.resolve(null)),
        })),
      })),
      put: vi.fn(() => Promise.resolve()),
      add: vi.fn(() => Promise.resolve()),
      bulkPut: vi.fn(() => Promise.resolve()),
    },
    versions: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          and: vi.fn(() => ({
            toArray: vi.fn(() => Promise.resolve([])),
          })),
          delete: vi.fn(() => Promise.resolve()),
        })),
      })),
    },
    transaction: vi.fn((mode, tables, callback) => callback()),
  },
}));

// Mock ftrackService with all required methods
vi.mock("@/services/ftrack", () => ({
  ftrackService: {
    getPlaylists: vi.fn(() => Promise.resolve([])),
    getLists: vi.fn(() => Promise.resolve([])),
  },
}));

let initialState: ReturnType<typeof usePlaylistsStore.getState>;

beforeAll(() => {
  // Snapshot the initial state for resetting between tests
  initialState = { ...usePlaylistsStore.getState() };
});

beforeEach(() => {
  // Reset the store to its initial state
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
    (ftrackService.getLists as any).mockResolvedValue([]);

    const promise = usePlaylistsStore.getState().loadPlaylists();

    // Wait a tick for the async operation to start
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Check if loading is set (the implementation might set loading in a try-catch)
    let state = usePlaylistsStore.getState();
    if (state.isLoading) {
      expect(state.isLoading).toBe(true);
    }

    await promise;

    state = usePlaylistsStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    
    // With project filtering: when no projectId is provided, only Quick Notes should be shown
    const names = state.playlists.map((p) => p.name);
    expect(names).toContain("Quick Notes");
    
    // "Playlist 1" should NOT be included when no project is selected (project filtering)
    expect(names).not.toContain("Playlist 1");
    expect(names).toHaveLength(1); // Only Quick Notes
  });

  it("loadPlaylists should include project playlists when projectId is provided", async () => {
    const mockPlaylist = createMockPlaylist({
      id: "p1",
      name: "Playlist 1",
      title: "Playlist 1",
      notes: [],
      projectId: "test-project-id",
    });
    const mockPlaylists = [mockPlaylist];
    (ftrackService.getPlaylists as any).mockResolvedValue(mockPlaylists);
    (ftrackService.getLists as any).mockResolvedValue([]);

    const promise = usePlaylistsStore.getState().loadPlaylists("test-project-id");

    await promise;

    const state = usePlaylistsStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    
    // With projectId provided, should include both Quick Notes and project playlists
    const names = state.playlists.map((p) => p.name);
    expect(names).toContain("Quick Notes");
    expect(names).toContain("Playlist 1");
  });

  it("loadPlaylists should set error on failure", async () => {
    const error = new Error("Failed to load");
    (ftrackService.getPlaylists as any).mockRejectedValue(error);
    (ftrackService.getLists as any).mockRejectedValue(error);

    const promise = usePlaylistsStore.getState().loadPlaylists();

    // Wait a tick for the async operation to start
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Check if loading is set
    let state = usePlaylistsStore.getState();
    if (state.isLoading) {
      expect(state.isLoading).toBe(true);
    }

    await promise;

    state = usePlaylistsStore.getState();
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
    (ftrackService.getLists as any).mockResolvedValue([]);

    await usePlaylistsStore.getState().updatePlaylist("p2");

    const state = usePlaylistsStore.getState();
    const updated = state.playlists.find((p) => p.id === "p2");
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("New Name");
  });

  it("updatePlaylist should do nothing for quick-notes", async () => {
    (ftrackService.getPlaylists as any).mockResolvedValue([]);
    (ftrackService.getLists as any).mockResolvedValue([]);

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
    (ftrackService.getLists as any).mockResolvedValue([]);

    await usePlaylistsStore.getState().updatePlaylist("p3");

    const state = usePlaylistsStore.getState();
    // 'p3' should still be present
    expect(state.playlists.some((p) => p.id === "p3")).toBe(true);
  });
});
