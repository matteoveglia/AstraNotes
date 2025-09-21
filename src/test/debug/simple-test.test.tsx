import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { db } from "@/store/db";

// Mock ftrack services
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: {
    getPlaylists: vi.fn(),
    getLists: vi.fn(),
  },
}));

describe("Simple Debug Test", () => {
  let mockFtrackService: any;

  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Get mock service
    const { ftrackPlaylistService } = await import(
      "@/services/ftrack/FtrackPlaylistService"
    );
    mockFtrackService = ftrackPlaylistService;
  });

  afterEach(async () => {
    // Clean up database
    await db.playlists.clear();
    await db.versions.clear();
  });

  it("should be able to call loadPlaylists without errors", async () => {
    // Mock empty responses
    mockFtrackService.getPlaylists.mockResolvedValue([]);
    mockFtrackService.getLists.mockResolvedValue([]);

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
