import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { db } from "@/store/db";
import { TestDataFactory } from "@/test/utils/testHelpers";

// Mock ftrack services
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: {
    getPlaylists: vi.fn(),
    getLists: vi.fn(),
  },
}));

vi.mock("@/services/ftrack/FtrackNoteService", () => ({
  ftrackNoteService: {
    publishNoteWithAttachmentsAPI: vi.fn(),
  },
}));

describe("Isolated Error Test", () => {
  let mockFtrackService: any;

  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();
    
    // Get mock service
    const { ftrackPlaylistService } = await import("@/services/ftrack/FtrackPlaylistService");
    mockFtrackService = ftrackPlaylistService;
  });

  it("should handle database errors gracefully during deduplication", async () => {
    // Mock a database error during cleanup
    const originalClear = db.playlists.clear;
    vi.spyOn(db.playlists, 'clear').mockRejectedValueOnce(new Error("Database error"));

    const ftrackPlaylist = TestDataFactory.createFtrackPlaylist({
      id: "ftrack-uuid-1",
      ftrackId: "ftrack-123",
      name: "Test Playlist",
    });

    mockFtrackService.getPlaylists.mockResolvedValue([ftrackPlaylist]);
    mockFtrackService.getLists.mockResolvedValue([]);

    const { result } = renderHook(() => usePlaylistsStore());

    console.log("Hook result before loadPlaylists:", result.current);
    expect(result.current).toBeDefined();
    expect(result.current).not.toBeNull();

    // Should not throw an error
    await act(async () => {
      console.log("About to call loadPlaylists, result.current:", result.current);
      await result.current.loadPlaylists("project-123");
    });

    // Restore original method
    db.playlists.clear = originalClear;

    console.log("Hook result after loadPlaylists:", result.current);

    // Should still show playlists in UI (graceful degradation)
    expect(result.current.playlists.length).toBeGreaterThan(0);
  });
});