import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { db } from "@/store/db";

const mockGetPlaylists = vi.fn();
const mockGetLists = vi.fn();

const playlistClientMock = {
  getPlaylists: mockGetPlaylists,
  getLists: mockGetLists,
};

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => playlistClientMock),
}));

describe("Simple Debug Test", () => {
  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockGetPlaylists.mockReset();
    mockGetLists.mockReset();
  });

  afterEach(async () => {
    // Clean up database
    await db.playlists.clear();
    await db.versions.clear();
  });

  it("should be able to call loadPlaylists without errors", async () => {
    // Mock empty responses
    mockGetPlaylists.mockResolvedValue([]);
    mockGetLists.mockResolvedValue([]);

    const { result } = renderHook(() => usePlaylistsStore());

    // Check initial state
    console.log("Initial playlists:", result.current.playlists.length);
    console.log("Initial loading:", result.current.isLoading);
    console.log("Initial error:", result.current.error);

    // Try to call loadPlaylists
    await act(async () => {
      await result.current.loadPlaylists("test-project");
    });

    // Check final state
    console.log("Final playlists:", result.current.playlists.length);
    console.log("Final loading:", result.current.isLoading);
    console.log("Final error:", result.current.error);

    // Basic assertions
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(Array.isArray(result.current.playlists)).toBe(true);
  });
});
