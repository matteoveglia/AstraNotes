import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { db } from "@/store/db";
import { TestDataFactory } from "@/test/utils/testHelpers";
import { createPlaylistServiceMock } from "@/test/utils/createPlaylistServiceMock";

const { service: playlistService, mocks: playlistMocks } = vi.hoisted(() =>
  createPlaylistServiceMock(),
);

const mockGetPlaylists = playlistMocks.getPlaylists;
const mockGetLists = playlistMocks.getLists;

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => playlistService),
}));

vi.mock("@/services/ftrack/FtrackNoteService", () => ({
  ftrackNoteService: {
    publishNoteWithAttachmentsAPI: vi.fn(),
  },
}));

describe("Isolated Error Test", () => {
  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockGetPlaylists.mockReset();
    mockGetLists.mockReset();
    mockGetPlaylists.mockResolvedValue([]);
    mockGetLists.mockResolvedValue([]);
  });

  it("should handle database errors gracefully during deduplication", async () => {
    // Mock a database error during cleanup
    const originalClear = db.playlists.clear;
    vi.spyOn(db.playlists, "clear").mockRejectedValueOnce(
      new Error("Database error"),
    );

    const ftrackPlaylist = TestDataFactory.createFtrackPlaylist({
      id: "ftrack-uuid-1",
      ftrackId: "ftrack-123",
      name: "Test Playlist",
    });

    mockGetPlaylists.mockResolvedValue([ftrackPlaylist]);
    mockGetLists.mockResolvedValue([]);

    const { result } = renderHook(() => usePlaylistsStore());

    console.log("Hook result before loadPlaylists:", result.current);
    expect(result.current).toBeDefined();
    expect(result.current).not.toBeNull();

    // Should not throw an error
    await act(async () => {
      console.log(
        "About to call loadPlaylists, result.current:",
        result.current,
      );
      await result.current.loadPlaylists("project-123");
    });

    // Restore original method
    db.playlists.clear = originalClear;

    console.log("Hook result after loadPlaylists:", result.current);

    // Should still show playlists in UI (graceful degradation)
    expect(result.current.playlists.length).toBeGreaterThan(0);
  });
});
