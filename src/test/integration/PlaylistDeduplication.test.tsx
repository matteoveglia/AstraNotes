import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Playlist } from "@/types";
import { db } from "@/store/db";
import { TestDataFactory } from "@/test/utils/testHelpers";

const {
  mockGetPlaylists,
  mockGetLists,
  playlistServiceMock,
} = vi.hoisted(() => {
  const mockGetPlaylists = vi.fn();
  const mockGetLists = vi.fn();

  const playlistServiceMock = {
    getPlaylists: mockGetPlaylists,
    getLists: mockGetLists,
  };

  return {
    mockGetPlaylists,
    mockGetLists,
    playlistServiceMock,
  };
});

const mockFtrackService = playlistServiceMock;

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => playlistServiceMock),
}));

vi.mock("@/services/ftrack/FtrackNoteService", () => ({
  ftrackNoteService: {
    getNotes: vi.fn(),
  },
}));

vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: mockFtrackService,
}));

// Mock project store to provide selectedProjectId for reset method
vi.mock("@/store/projectStore", () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      selectedProjectId: "project-123",
    })),
    subscribe: vi.fn(),
  },
}));

describe("Playlist Deduplication Integration Tests", () => {
  let mockPlaylistClient: typeof playlistServiceMock;

  beforeEach(async () => {
    // Clear database
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockGetPlaylists.mockReset();
    mockGetLists.mockReset();
    mockGetPlaylists.mockResolvedValue([]);
    mockGetLists.mockResolvedValue([]);

    // Import service dynamically to get the mocked version
    const { playlistClient } = await import("@/services/client");
    mockPlaylistClient = playlistClient();
    mockFtrackService.getPlaylists.mockReset();
    mockFtrackService.getLists.mockReset();
    mockFtrackService.getPlaylists.mockResolvedValue([]);
    mockFtrackService.getLists.mockResolvedValue([]);
  });

  afterEach(async () => {
    // Clean up database
    await db.playlists.clear();
    await db.versions.clear();
  });

  describe("Race Condition Prevention", () => {
    it("should prevent duplicate database entries during concurrent refresh operations", async () => {
      // Create mock ftrack playlists
      const ftrackPlaylists = [
        TestDataFactory.createFtrackPlaylist({
          id: "ftrack-uuid-1",
          ftrackId: "ftrack-123",
          name: "Test Playlist 1",
        }),
        TestDataFactory.createFtrackPlaylist({
          id: "ftrack-uuid-2",
          ftrackId: "ftrack-456",
          name: "Test Playlist 2",
        }),
      ];

      // Mock ftrack service to return the same playlists
      mockPlaylistClient.getPlaylists.mockResolvedValue(ftrackPlaylists);
      mockPlaylistClient.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      // Simulate concurrent refresh operations using store methods directly
      const refreshPromises = Array.from({ length: 3 }, () =>
        store.loadPlaylists("project-123"),
      );

      await Promise.all(refreshPromises);

      // Verify no duplicate database entries were created
      const dbPlaylists = await db.playlists.toArray();

      console.log(
        "Database playlists after concurrent operations:",
        dbPlaylists.map((p) => ({
          id: p.id,
          ftrackId: p.ftrackId || "unknown",
          name: p.name,
        })),
      );

      // Filter out Quick Notes playlists for this test
      const nonQuickNotesPlaylists = dbPlaylists.filter(
        (p) => !p.id.startsWith("quick-notes-"),
      );

      // Should have exactly 2 playlists in database (one for each ftrack playlist)
      expect(nonQuickNotesPlaylists).toHaveLength(2);

      // Verify each ftrack playlist has only one database entry
      const playlist1Entries = nonQuickNotesPlaylists.filter(
        (p) => p.ftrackId === "ftrack-uuid-1",
      );
      const playlist2Entries = nonQuickNotesPlaylists.filter(
        (p) => p.ftrackId === "ftrack-uuid-2",
      );

      expect(playlist1Entries).toHaveLength(1);
      expect(playlist2Entries).toHaveLength(1);

      // Verify the playlists have the correct metadata
      expect(playlist1Entries[0].name).toBe("Test Playlist 1");
      expect(playlist2Entries[0].name).toBe("Test Playlist 2");

      // Verify store state is consistent
      const finalStore = usePlaylistsStore.getState();
      const storePlaylists = finalStore.playlists.filter(
        (p) => !p.isQuickNotes,
      );
      expect(storePlaylists).toHaveLength(2);
    });

    it("should clean up existing duplicate entries before processing new ones", async () => {
      // Pre-populate database with duplicate entries (simulating the bug state)
      const duplicateEntries = [
        {
          id: "db-uuid-1",
          name: "Test Playlist",
          ftrackId: "ftrack-123",
          type: "reviewsession" as const,
          projectId: "project-123",
          localStatus: "synced" as const,
          ftrackSyncStatus: "synced" as const,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "db-uuid-2",
          name: "Test Playlist",
          ftrackId: "ftrack-123", // Same ftrackId - duplicate!
          type: "reviewsession" as const,
          projectId: "project-123",
          localStatus: "synced" as const,
          ftrackSyncStatus: "synced" as const,
          createdAt: "2024-01-01T01:00:00Z", // Later timestamp
          updatedAt: "2024-01-01T01:00:00Z",
        },
        {
          id: "db-uuid-3",
          name: "Test Playlist",
          ftrackId: "ftrack-123", // Same ftrackId - another duplicate!
          type: "reviewsession" as const,
          projectId: "project-123",
          localStatus: "synced" as const,
          ftrackSyncStatus: "synced" as const,
          createdAt: "2024-01-01T02:00:00Z", // Even later timestamp
          updatedAt: "2024-01-01T02:00:00Z",
        },
      ];

      await db.playlists.bulkAdd(duplicateEntries);

      // Verify duplicates exist
      const beforeCleanup = await db.playlists
        .where("ftrackId")
        .equals("ftrack-123")
        .toArray();
      expect(beforeCleanup).toHaveLength(3);

      // Mock ftrack service to return the playlist
      const ftrackPlaylist = TestDataFactory.createFtrackPlaylist({
        id: "ftrack-uuid-1",
        ftrackId: "ftrack-123",
        name: "Test Playlist",
      });

      mockPlaylistClient.getPlaylists.mockResolvedValue([ftrackPlaylist]);
      mockPlaylistClient.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      await store.loadPlaylists("project-123");

      // Verify cleanup occurred - should only have one entry now
      const afterCleanup = await db.playlists
        .where("ftrackId")
        .equals("ftrack-123")
        .toArray();
      expect(afterCleanup).toHaveLength(1);

      // Verify the first (oldest) entry was kept
      expect(afterCleanup[0].id).toBe("db-uuid-1");
      expect(afterCleanup[0].createdAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("Deduplication Logic", () => {
    it("should prefer database version over ftrack version when both exist", async () => {
      // Create a database playlist first
      const dbPlaylist = {
        id: "db-uuid-1",
        name: "Database Version",
        ftrackId: "ftrack-123",
        type: "reviewsession" as const,
        projectId: "project-123",
        localStatus: "synced" as const,
        ftrackSyncStatus: "synced" as const,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      await db.playlists.add(dbPlaylist);

      // Mock ftrack service to return a playlist with the same ftrackId
      const ftrackPlaylist = TestDataFactory.createFtrackPlaylist({
        id: "ftrack-uuid-1",
        ftrackId: "ftrack-123",
        name: "Ftrack Version", // Different name
      });

      mockFtrackService.getPlaylists.mockResolvedValue([ftrackPlaylist]);
      mockFtrackService.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      await store.loadPlaylists("project-123");

      // Verify database version is preferred
      const finalStore = usePlaylistsStore.getState();
      const targetPlaylist = finalStore.playlists.find(
        (p: any) => p.ftrackId === "ftrack-123",
      );

      expect(targetPlaylist).toBeDefined();
      expect(targetPlaylist?.name).toBe("Database Version"); // Should keep database name
      expect(targetPlaylist?.id).toBe("db-uuid-1"); // Should keep database ID

      // Verify no duplicate was created in database
      const dbPlaylists = await db.playlists
        .where("ftrackId")
        .equals("ftrack-123")
        .toArray();
      expect(dbPlaylists).toHaveLength(1);
      expect(dbPlaylists[0].name).toBe("Database Version");
    });

    it("should store unique ftrack playlists with stable UUIDs", async () => {
      // Mock ftrack service to return new playlists
      const ftrackPlaylists = [
        TestDataFactory.createFtrackPlaylist({
          id: "ftrack-uuid-1",
          ftrackId: "ftrack-123",
          name: "New Playlist 1",
        }),
        TestDataFactory.createFtrackPlaylist({
          id: "ftrack-uuid-2",
          ftrackId: "ftrack-456",
          name: "New Playlist 2",
        }),
      ];

      mockFtrackService.getPlaylists.mockResolvedValue(ftrackPlaylists);
      mockFtrackService.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      await store.loadPlaylists("project-123");

      // Verify playlists were stored in database with stable UUIDs
      const dbPlaylists = await db.playlists.toArray();
      console.log(
        "Fourth test - All Database playlists:",
        dbPlaylists.map((p) => ({
          id: p.id,
          ftrackId: p.ftrackId || "unknown",
          name: p.name,
          isQuickNotes: p.id.startsWith("quick-notes-"),
        })),
      );

      // Filter out Quick Notes playlists for this test (identified by ID pattern)
      const nonQuickNotesPlaylists = dbPlaylists.filter(
        (p) => !p.id.startsWith("quick-notes-"),
      );
      console.log(
        "Fourth test - Non-Quick Notes playlists:",
        nonQuickNotesPlaylists.map((p) => ({
          id: p.id,
          ftrackId: p.ftrackId || "unknown",
          name: p.name,
        })),
      );
      expect(nonQuickNotesPlaylists).toHaveLength(2);

      // Verify playlists exist with correct ftrackIds and have stable UUIDs
      const playlist1 = nonQuickNotesPlaylists.find(
        (p) => p.ftrackId === "ftrack-uuid-1",
      );
      const playlist2 = nonQuickNotesPlaylists.find(
        (p) => p.ftrackId === "ftrack-uuid-2",
      );

      expect(playlist1).toBeDefined();
      expect(playlist2).toBeDefined();
      expect(playlist1?.name).toBe("New Playlist 1");
      expect(playlist2?.name).toBe("New Playlist 2");

      // Verify stable UUIDs are generated (should be valid UUIDs, not the ftrack IDs)
      expect(playlist1?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(playlist2?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Store the generated UUIDs for stability check
      const playlist1Id = playlist1?.id;
      const playlist2Id = playlist2?.id;

      // Run loadPlaylists again to verify UUIDs remain stable
      await store.loadPlaylists("project-123");

      const dbPlaylistsAfterSecondLoad = await db.playlists.toArray();
      const nonQuickNotesAfterSecondLoad = dbPlaylistsAfterSecondLoad.filter(
        (p) => !p.id.startsWith("quick-notes-"),
      );
      expect(nonQuickNotesAfterSecondLoad).toHaveLength(2);

      const playlist1AfterSecondLoad = nonQuickNotesAfterSecondLoad.find(
        (p) => p.ftrackId === "ftrack-uuid-1",
      );
      const playlist2AfterSecondLoad = nonQuickNotesAfterSecondLoad.find(
        (p) => p.ftrackId === "ftrack-uuid-2",
      );

      // Verify UUIDs remained stable (same as before)
      expect(playlist1AfterSecondLoad?.id).toBe(playlist1Id);
      expect(playlist2AfterSecondLoad?.id).toBe(playlist2Id);
    });
  });

  describe("Stress Testing", () => {
    it("should handle rapid consecutive refresh operations without creating duplicates", async () => {
      // Create a larger set of ftrack playlists
      const ftrackPlaylists = Array.from({ length: 10 }, (_, i) =>
        TestDataFactory.createFtrackPlaylist({
          id: `ftrack-uuid-${i}`,
          ftrackId: `ftrack-${i}`,
          name: `Test Playlist ${i}`,
        }),
      );

      mockFtrackService.getPlaylists.mockResolvedValue(ftrackPlaylists);
      mockFtrackService.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      // Perform 5 rapid consecutive refresh operations
      const refreshPromises = Array.from({ length: 5 }, () =>
        store.loadPlaylists("project-123"),
      );

      await Promise.all(refreshPromises);

      // Verify exactly 10 playlists in database (no duplicates, excluding Quick Notes)
      const dbPlaylists = await db.playlists.toArray();
      const nonQuickNotesPlaylists = dbPlaylists.filter(
        (p) => !p.id.startsWith("quick-notes-"),
      );
      expect(nonQuickNotesPlaylists).toHaveLength(10);

      // Verify each ftrackId appears exactly once
      const ftrackIds = nonQuickNotesPlaylists.map((p) => p.ftrackId);
      const uniqueFtrackIds = [...new Set(ftrackIds)];
      expect(uniqueFtrackIds).toHaveLength(10);

      // Verify store shows exactly 10 playlists
      const finalStore = usePlaylistsStore.getState();
      expect(
        finalStore.playlists.filter((p: any) => !p.isQuickNotes),
      ).toHaveLength(10);
    });

    it("should handle mixed scenarios with existing database playlists and new ftrack playlists", async () => {
      // Pre-populate database with some playlists
      const existingDbPlaylists = [
        {
          id: "existing-db-1",
          name: "Existing DB Playlist 1",
          ftrackId: "existing-ftrack-1",
          type: "reviewsession" as const,
          projectId: "project-123",
          localStatus: "synced" as const,
          ftrackSyncStatus: "synced" as const,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "existing-db-2",
          name: "Existing DB Playlist 2",
          ftrackId: "existing-ftrack-2",
          type: "reviewsession" as const,
          projectId: "project-123",
          localStatus: "synced" as const,
          ftrackSyncStatus: "synced" as const,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ];

      await db.playlists.bulkAdd(existingDbPlaylists);

      // Mock ftrack service to return mix of existing and new playlists
      const ftrackPlaylists = [
        // Existing playlists (should be deduplicated) - id must match the ftrackId in database
        TestDataFactory.createFtrackPlaylist({
          id: "existing-ftrack-1",
          ftrackId: "existing-ftrack-1",
          name: "Existing Ftrack Version 1", // Different name
        }),
        TestDataFactory.createFtrackPlaylist({
          id: "existing-ftrack-2",
          ftrackId: "existing-ftrack-2",
          name: "Existing Ftrack Version 2", // Different name
        }),
        // New playlist (should be stored)
        TestDataFactory.createFtrackPlaylist({
          id: "new-ftrack-1",
          ftrackId: "new-ftrack-1",
          name: "New Ftrack Playlist",
        }),
      ];

      mockFtrackService.getPlaylists.mockResolvedValue(ftrackPlaylists);
      mockFtrackService.getLists.mockResolvedValue([]);

      // Import store and get direct access to store methods
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const store = usePlaylistsStore.getState();

      await store.loadPlaylists("project-123");

      // Verify total count: 2 existing + 1 new = 3 playlists (excluding Quick Notes)
      const dbPlaylists = await db.playlists.toArray();
      const nonQuickNotesPlaylists = dbPlaylists.filter(
        (p) => !p.id.startsWith("quick-notes-"),
      );
      expect(nonQuickNotesPlaylists).toHaveLength(3);

      // Verify existing playlists kept database versions
      const existingPlaylist1 = nonQuickNotesPlaylists.find(
        (p) => p.ftrackId === "existing-ftrack-1",
      );
      expect(existingPlaylist1?.name).toBe("Existing DB Playlist 1");
      expect(existingPlaylist1?.id).toBe("existing-db-1");

      const existingPlaylist2 = nonQuickNotesPlaylists.find(
        (p) => p.ftrackId === "existing-ftrack-2",
      );
      expect(existingPlaylist2?.name).toBe("Existing DB Playlist 2");
      expect(existingPlaylist2?.id).toBe("existing-db-2");

      // Verify new playlist was stored
      const newPlaylist = nonQuickNotesPlaylists.find(
        (p) => p.ftrackId === "new-ftrack-1",
      );
      expect(newPlaylist?.name).toBe("New Ftrack Playlist");
      expect(newPlaylist?.id).not.toBe("new-ftrack-1"); // Should be a generated UUID, not the ftrack ID

      // Verify UI shows all playlists
      const finalStore = usePlaylistsStore.getState();
      const nonQuickNotesInStore = finalStore.playlists.filter(
        (p: any) => !p.isQuickNotes,
      );
      expect(nonQuickNotesInStore).toHaveLength(3);
    });
  });

  describe("Error Handling", () => {
    it.skip("should handle service errors gracefully during playlist loading", async () => {
      // Mock ftrack service to throw an error
      mockFtrackService.getPlaylists.mockRejectedValueOnce(
        new Error("Ftrack service error"),
      );
      mockFtrackService.getLists.mockResolvedValue([]);

      // Reset modules to ensure fresh store instance
      vi.resetModules();

      // Use dynamic import to get fresh store instance
      const { usePlaylistsStore } = await import("@/store/playlistsStore");
      const { result } = renderHook(() => usePlaylistsStore());

      await act(async () => {
        await result.current.loadPlaylists("project-123");
      });

      // Verify error was captured
      expect(result.current.error).toBeTruthy();
      expect(result.current.error).toContain("Ftrack service error");
      expect(result.current.isLoading).toBe(false);
    });
  });
});
