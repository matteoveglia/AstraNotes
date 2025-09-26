import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePlaylistsStore } from "../../store/playlistsStore";
import { db } from "@/store/db";
import { TestDataFactory } from "../utils/testHelpers";

const { mockGetPlaylists, mockGetLists } = vi.hoisted(() => ({
  mockGetPlaylists: vi.fn(),
  mockGetLists: vi.fn(),
}));

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => ({
    getPlaylists: mockGetPlaylists,
    getLists: mockGetLists,
  })),
}));

vi.mock("@/services/ftrack/FtrackNoteService", () => ({
  ftrackNoteService: {
    publishNoteWithAttachmentsAPI: vi.fn(),
  },
}));

describe("Transaction Debug Test", () => {
  beforeEach(async () => {
    // Clear database
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockGetPlaylists.mockReset();
    mockGetLists.mockReset();
    mockGetPlaylists.mockResolvedValue([]);
    mockGetLists.mockResolvedValue([]);
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
    mockGetPlaylists.mockResolvedValue(ftrackPlaylists);
    mockGetLists.mockResolvedValue([]);

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
