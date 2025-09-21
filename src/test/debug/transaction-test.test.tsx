import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePlaylistsStore } from "../../store/playlistsStore";
import { db } from "@/store/db";
import { TestDataFactory } from "../utils/testHelpers";

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

describe("Transaction Debug Test", () => {
  let mockFtrackService: any;

  beforeEach(async () => {
    // Clear database
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Get mock service
    const { ftrackPlaylistService } = await import(
      "@/services/ftrack/FtrackPlaylistService"
    );
    mockFtrackService = ftrackPlaylistService;
  });

  it("should store playlists in database during loadPlaylists", async () => {
    // Setup test data
    const ftrackPlaylists = [
      TestDataFactory.createFtrackPlaylist({
        id: "ftrack-123",
        name: "Test Playlist 1",
        projectId: "project-1",
      }),
    ];

    // Mock ftrack service
    mockFtrackService.getPlaylists.mockResolvedValue(ftrackPlaylists);
    mockFtrackService.getLists.mockResolvedValue([]);

    // Call loadPlaylists
    const { loadPlaylists } = usePlaylistsStore.getState();
    await loadPlaylists("project-1");

    // Check database directly
    const dbPlaylists = await db.playlists.toArray();
    console.log("Database playlists after loadPlaylists:", dbPlaylists);

    expect(dbPlaylists).toHaveLength(1);
    expect(dbPlaylists[0].ftrackId).toBe("ftrack-123");
    expect(dbPlaylists[0].name).toBe("Test Playlist 1");
  });
});
