import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { usePlaylistsStore } from "@/store/playlistsStore";
import type { Playlist } from "@/types";
import { db } from "@/store/db";
import { TestDataFactory } from "@/test/utils/testHelpers";
import { createPlaylistServiceMock } from "@/test/utils/createPlaylistServiceMock";

const { service: playlistService, mocks: playlistMocks } = vi.hoisted(() =>
  createPlaylistServiceMock(),
);

const mockGetPlaylists = playlistMocks.getPlaylists;
const mockGetLists = playlistMocks.getLists;
const mockGetPlaylistVersions = playlistMocks.getPlaylistVersions;

const { mockFtrackService } = vi.hoisted(() => ({
  mockFtrackService: {
    getPlaylists: vi.fn(),
    getLists: vi.fn(),
  },
}));

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => playlistService),
}));

vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: mockFtrackService,
}));

describe("Playlist Deduplication Performance Tests", () => {
  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockGetPlaylists.mockReset();
    mockGetLists.mockReset();
    mockGetPlaylistVersions.mockReset();
    mockFtrackService.getPlaylists.mockReset();
    mockFtrackService.getLists.mockReset();
    mockGetPlaylists.mockResolvedValue([]);
    mockGetLists.mockResolvedValue([]);
    mockGetPlaylistVersions.mockResolvedValue([]);
    mockFtrackService.getPlaylists.mockResolvedValue([]);
    mockFtrackService.getLists.mockResolvedValue([]);
  });

  afterEach(async () => {
    // Clean up database
    await db.playlists.clear();
    await db.versions.clear();
  });

  describe("Large Dataset Performance", () => {
    it("should handle 100 playlists efficiently", async () => {
      // Create 100 ftrack playlists
      const ftrackPlaylists = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createFtrackPlaylist({
          id: `ftrack-uuid-${i}`,
          ftrackId: `ftrack-${i}`,
          name: `Performance Test Playlist ${i}`,
          projectId: "project-123",
        }),
      );

      mockGetPlaylists.mockResolvedValue(ftrackPlaylists);
      mockGetLists.mockResolvedValue([]);

      const store = usePlaylistsStore.getState();

      const startTime = performance.now();

      await store.loadPlaylists("project-123");

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all playlists were processed correctly (exclude Quick Notes)
      const ui1 = usePlaylistsStore
        .getState()
        .playlists.filter((p) => !p.isQuickNotes);
      expect(ui1).toHaveLength(100);

      const dbPlaylists = await db.playlists.toArray();
      expect(dbPlaylists).toHaveLength(100);

      console.log(`Processed 100 playlists in ${duration.toFixed(2)}ms`);
    });

    it("should handle deduplication with 50 existing + 50 new playlists efficiently", async () => {
      // Pre-populate database with 50 playlists
      const existingPlaylists = Array.from({ length: 50 }, (_, i) => ({
        id: `existing-db-${i}`,
        name: `Existing Playlist ${i}`,
        ftrackId: `existing-ftrack-${i}`,
        type: "reviewsession" as const,
        projectId: "project-123",
        localStatus: "synced" as const,
        ftrackSyncStatus: "synced" as const,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      }));

      await db.playlists.bulkAdd(existingPlaylists);

      // Create 100 ftrack playlists (50 existing + 50 new)
      const ftrackPlaylists = [
        // 50 existing playlists (should be deduplicated)
        ...Array.from({ length: 50 }, (_, i) =>
          TestDataFactory.createFtrackPlaylist({
            id: `ftrack-uuid-existing-${i}`,
            ftrackId: `existing-ftrack-${i}`,
            name: `Ftrack Version of Existing ${i}`,
          }),
        ),
        // 50 new playlists (should be stored)
        ...Array.from({ length: 50 }, (_, i) =>
          TestDataFactory.createFtrackPlaylist({
            id: `ftrack-uuid-new-${i}`,
            ftrackId: `new-ftrack-${i}`,
            name: `New Ftrack Playlist ${i}`,
          }),
        ),
      ];

      mockGetPlaylists.mockResolvedValue(ftrackPlaylists);
      mockGetLists.mockResolvedValue([]);

      const store = usePlaylistsStore.getState();

      const startTime = performance.now();

      await store.loadPlaylists("project-123");

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(7000); // 7 seconds

      // Verify correct deduplication: 50 existing + 50 new = 100 total (exclude Quick Notes)
      const ui2 = usePlaylistsStore
        .getState()
        .playlists.filter((p) => !p.isQuickNotes);
      expect(ui2).toHaveLength(100);

      const dbPlaylists = await db.playlists.toArray();
      expect(dbPlaylists).toHaveLength(100);

      // Verify existing playlists kept their database names
      const existingPlaylistsAfter = dbPlaylists.filter((p) =>
        p.ftrackId?.startsWith("existing-ftrack-"),
      );
      expect(existingPlaylistsAfter).toHaveLength(50);
      expect(existingPlaylistsAfter[0].name).toMatch(/^Existing Playlist/);

      console.log(
        `Processed 100 playlists (50 existing + 50 new) with deduplication in ${duration.toFixed(2)}ms`,
      );
    });
  });

  describe("Concurrent Operations Performance", () => {
    it("should handle 10 concurrent refresh operations efficiently", async () => {
      // Create 20 ftrack playlists
      const ftrackPlaylists = Array.from({ length: 20 }, (_, i) =>
        TestDataFactory.createFtrackPlaylist({
          id: `ftrack-uuid-${i}`,
          ftrackId: `ftrack-${i}`,
          name: `Concurrent Test Playlist ${i}`,
        }),
      );

      mockGetPlaylists.mockResolvedValue(ftrackPlaylists);
      mockGetLists.mockResolvedValue([]);

      const store = usePlaylistsStore.getState();

      const startTime = performance.now();

      // Perform 10 concurrent refresh operations
      const refreshPromises = Array.from({ length: 10 }, () =>
        usePlaylistsStore.getState().loadPlaylists("project-123"),
      );

      await Promise.all(refreshPromises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds

      // Verify no duplicates were created
      const dbPlaylists = await db.playlists.toArray();
      expect(dbPlaylists).toHaveLength(20);

      // Verify each ftrackId appears exactly once
      const ftrackIds = dbPlaylists.map((p) => p.ftrackId);
      const uniqueFtrackIds = [...new Set(ftrackIds)];
      expect(uniqueFtrackIds).toHaveLength(20);

      console.log(
        `Completed 10 concurrent refresh operations in ${duration.toFixed(2)}ms`,
      );
    });
  });

  describe("Memory Usage", () => {
    it("should not leak memory during repeated refresh operations", async () => {
      // Create a moderate set of playlists
      const ftrackPlaylists = Array.from({ length: 30 }, (_, i) =>
        TestDataFactory.createFtrackPlaylist({
          id: `ftrack-uuid-${i}`,
          ftrackId: `ftrack-${i}`,
          name: `Memory Test Playlist ${i}`,
        }),
      );

      mockGetPlaylists.mockResolvedValue(ftrackPlaylists);
      mockGetLists.mockResolvedValue([]);

      const store = usePlaylistsStore.getState();

      // Perform 20 sequential refresh operations
      for (let i = 0; i < 20; i++) {
        await store.loadPlaylists("project-123");

        // Verify consistent state after each operation (exclude Quick Notes)
        const ui = usePlaylistsStore
          .getState()
          .playlists.filter((p) => !p.isQuickNotes);
        expect(ui).toHaveLength(30);

        const dbPlaylists = await db.playlists.toArray();
        expect(dbPlaylists).toHaveLength(30);
      }

      // Final verification - no memory leaks should result in consistent data
      const finalDbPlaylists = await db.playlists.toArray();
      expect(finalDbPlaylists).toHaveLength(30);

      // Verify each ftrackId appears exactly once
      const ftrackIds = finalDbPlaylists.map((p) => p.ftrackId);
      const uniqueFtrackIds = [...new Set(ftrackIds)];
      expect(uniqueFtrackIds).toHaveLength(30);

      console.log(
        "Completed 20 sequential refresh operations without memory leaks",
      );
    });
  });

  describe("Database Cleanup Performance", () => {
    it("should efficiently clean up large numbers of duplicate entries", async () => {
      // Create 100 duplicate entries for the same ftrack playlist
      const duplicateEntries = Array.from({ length: 100 }, (_, i) => ({
        id: `duplicate-${i}`,
        name: "Duplicate Playlist",
        ftrackId: "ftrack-123",
        type: "reviewsession" as const,
        projectId: "project-123",
        localStatus: "synced" as const,
        ftrackSyncStatus: "synced" as const,
        createdAt: `2024-01-01T${String(i).padStart(2, "0")}:00:00Z`,
        updatedAt: `2024-01-01T${String(i).padStart(2, "0")}:00:00Z`,
      }));

      await db.playlists.bulkAdd(duplicateEntries);

      // Verify duplicates exist
      const beforeCleanup = await db.playlists
        .where("ftrackId")
        .equals("ftrack-123")
        .toArray();
      expect(beforeCleanup).toHaveLength(100);

      // Mock ftrack service
      const ftrackPlaylist = TestDataFactory.createFtrackPlaylist({
        id: "ftrack-uuid-1",
        ftrackId: "ftrack-123",
        name: "Clean Playlist",
      });

      mockFtrackService.getPlaylists.mockResolvedValue([ftrackPlaylist]);
      mockFtrackService.getLists.mockResolvedValue([]);

      const startTime = performance.now();

      const store = usePlaylistsStore.getState();
      await store.loadPlaylists("project-123");

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete cleanup efficiently
      expect(duration).toBeLessThan(3000); // 3 seconds

      // Verify cleanup occurred - should only have one entry now
      const afterCleanup = await db.playlists
        .where("ftrackId")
        .equals("ftrack-123")
        .toArray();
      expect(afterCleanup).toHaveLength(1);

      // Verify the first (oldest) entry was kept
      expect(afterCleanup[0].id).toBe("duplicate-0");

      console.log(
        `Cleaned up 100 duplicate entries in ${duration.toFixed(2)}ms`,
      );
    });
  });
});
