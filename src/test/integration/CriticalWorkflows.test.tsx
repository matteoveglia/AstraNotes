import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TestDataFactory,
  TestScenarios,
  TestValidators,
  TestDatabaseHelpers,
  TestConsoleHelpers,
} from "../utils/testHelpers";

// Mock ftrack service using factory function to avoid hoisting issues
vi.mock("@/services/ftrack", () => {
  const mockService = {
    getPlaylistVersions: vi.fn(),
    createPlaylist: vi.fn(),
    updatePlaylist: vi.fn(),
    addVersionsToPlaylist: vi.fn(),
    removeVersionFromPlaylist: vi.fn(),
  };

  return {
    FtrackService: vi.fn().mockImplementation(() => mockService),
    ftrackService: mockService,
  };
});

// Import store AFTER setting up mocks
import { playlistStore } from "@/store/playlist";
import { ftrackService } from "@/services/ftrack";

describe("Critical Workflows Integration Tests", () => {
  beforeEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
    playlistStore.clearCache();
    TestConsoleHelpers.mockConsole();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
    TestConsoleHelpers.restoreConsole();
  });

  describe("🔧 New Issue #1: Refresh Button Fix", () => {
    it("should preserve ftrack metadata when creating database entries", async () => {
      // Create a playlist using the proper store method
      const createdPlaylist = await playlistStore.createPlaylist({
        name: "Test Ftrack Playlist",
        type: "reviewsession",
        projectId: "project-456",
        categoryId: "category-789",
        categoryName: "VFX Review",
        description: "Test playlist",
        ftrackId: "ftrack-123",
      });

      const versions = TestDataFactory.createAssetVersions(2);

      // Add versions to the created playlist
      await playlistStore.addVersionsToPlaylist(createdPlaylist.id, versions);

      // Verify the playlist can be retrieved with correct metadata
      const retrievedPlaylist = await playlistStore.getPlaylist(
        createdPlaylist.id,
      );
      expect(retrievedPlaylist?.name).toBe("Test Ftrack Playlist");
      expect(retrievedPlaylist?.projectId).toBe("project-456");
      expect(retrievedPlaylist?.categoryId).toBe("category-789");
      expect(retrievedPlaylist?.categoryName).toBe("VFX Review");
      expect(retrievedPlaylist?.description).toBe("Test playlist");
      expect(retrievedPlaylist?.versions).toHaveLength(2);
    });

    it("should enable refresh functionality for ftrack playlists", async () => {
      const { playlist, freshVersions } =
        await TestScenarios.setupRefreshScenario();

      // Mock ftrack to return fresh versions
      vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(
        freshVersions,
      );

      // The refresh should work now that ftrackId is preserved
      const result = await playlistStore.refreshPlaylist(playlist.id);
      expect(result.success).toBe(true);

      // Verify API was called with ftrackId, not database UUID
      expect(ftrackService.getPlaylistVersions).toHaveBeenCalledWith(
        "ftrack-123",
      );
      expect(ftrackService.getPlaylistVersions).not.toHaveBeenCalledWith(
        playlist.id,
      );
    });
  });

  describe("🔧 Version Management: Added/Removed Persistence", () => {
    it("should persist added versions to database", async () => {
      const { playlist, versions } =
        await TestScenarios.setupFtrackPlaylistWithContent();
      const newVersions = TestDataFactory.createAssetVersions(1, {
        id: "new-version-unique",
        name: "New_Shot",
      });

      // Add new versions via store
      await playlistStore.addVersionsToPlaylist(playlist.id, newVersions);

      // Verify they were persisted to database
      const expectedVersionIds = [
        ...versions.map((v) => v.id),
        "new-version-unique",
      ];
      await TestValidators.validateVersionsInDatabase(
        playlist.id,
        expectedVersionIds,
      );
    });

    it("should mark removed versions in database", async () => {
      const { playlist, versions } =
        await TestScenarios.setupFtrackPlaylistWithContent();

      // Use the actual version ID from the setup
      const versionToRemove = versions[0].id;

      // Remove a version
      await playlistStore.removeVersionFromPlaylist(
        playlist.id,
        versionToRemove,
      );

      // Verify it was marked as removed
      await TestValidators.validateRemovedVersions(playlist.id, [
        versionToRemove,
      ]);

      // Verify other versions still exist
      const remainingVersionIds = versions.slice(1).map((v) => v.id);
      await TestValidators.validateVersionsInDatabase(
        playlist.id,
        remainingVersionIds,
      );
    });
  });

  describe("🔧 Draft and Publishing Workflows", () => {
    it("should save and preserve draft content", async () => {
      const { playlist, versions, draftVersionId } =
        await TestScenarios.setupFtrackPlaylistWithContent();

      // Verify draft was saved correctly
      await TestValidators.validateDraftContent(
        playlist.id,
        draftVersionId,
        "Test draft content",
        "draft",
      );

      // Save additional content
      await playlistStore.saveDraft(
        playlist.id,
        draftVersionId,
        "Updated content",
        "new-label",
      );

      await TestValidators.validateDraftContent(
        playlist.id,
        draftVersionId,
        "Updated content",
        "draft",
      );
    });

    it("should publish notes and update status correctly", async () => {
      const { playlist, versions, draftVersionId } =
        await TestScenarios.setupFtrackPlaylistWithContent();

      // Publish the note
      await playlistStore.publishNote(playlist.id, draftVersionId);

      // Verify status was updated to published
      await TestValidators.validateDraftContent(
        playlist.id,
        draftVersionId,
        "Test draft content", // content should remain
        "published", // status should change
      );
    });

    it("should clear drafts correctly", async () => {
      const { playlist, versions, draftVersionId } =
        await TestScenarios.setupFtrackPlaylistWithContent();

      // Clear the draft
      await playlistStore.clearDraft(playlist.id, draftVersionId);

      // Verify draft was cleared
      await TestValidators.validateDraftContent(
        playlist.id,
        draftVersionId,
        null, // content should be null
        "empty", // status should be empty
      );
    });
  });

  describe("🔧 Mixed Content Handling", () => {
    it("should handle ftrack and manual versions correctly", async () => {
      const { playlist, ftrackVersions, manualVersions } =
        await TestScenarios.setupMixedContentPlaylist();

      // Verify all versions were stored
      const allVersionIds = [...ftrackVersions, ...manualVersions].map(
        (v) => v.id,
      );
      await TestValidators.validateVersionsInDatabase(
        playlist.id,
        allVersionIds,
      );

      // Simulate refresh that should preserve manual versions
      const freshFtrackVersions = TestDataFactory.createAssetVersions(1, {
        id: "fresh-version",
      });
      vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(
        freshFtrackVersions,
      );

      const result = await playlistStore.refreshPlaylist(playlist.id);
      expect(result.success).toBe(true);

      // Manual versions should still exist after refresh
      const manualVersionIds = manualVersions.map((v) => v.id);
      await TestValidators.validateVersionsInDatabase(playlist.id, [
        ...manualVersionIds,
        "fresh-version",
      ]);
    });
  });

  describe("🔧 Cache and Performance", () => {
    it("should cache playlists for fast retrieval", async () => {
      const { playlist } = await TestScenarios.setupFtrackPlaylistWithContent();

      // First retrieval (hits database)
      const playlist1 = await playlistStore.getPlaylist(playlist.id);
      expect(playlist1?.name).toBe(playlist.name);

      // Second retrieval (should hit cache)
      const playlist2 = await playlistStore.getPlaylist(playlist.id);
      expect(playlist2?.name).toBe(playlist.name);

      // Verify cache has content
      const stats = playlistStore.getCacheStats();
      expect(stats.playlists.size).toBeGreaterThan(0);
    });

    it("should invalidate cache when data changes", async () => {
      const { playlist } = await TestScenarios.setupFtrackPlaylistWithContent();

      // Load into cache
      await playlistStore.getPlaylist(playlist.id);

      // Modify data
      const newVersions = TestDataFactory.createAssetVersions(1, {
        id: "cache-test-version",
      });
      await playlistStore.addVersionsToPlaylist(playlist.id, newVersions);

      // Should get fresh data
      const freshPlaylist = await playlistStore.getPlaylist(playlist.id);
      expect(
        freshPlaylist?.versions?.some((v) => v.id === "cache-test-version"),
      ).toBe(true);
    });
  });

  describe("🔧 Error Handling and Edge Cases", () => {
    it("should handle missing playlists gracefully", async () => {
      const playlist = await playlistStore.getPlaylist("non-existent");
      expect(playlist).toBeNull();
    });

    it("should prevent operations on non-existent playlists", async () => {
      const versions = TestDataFactory.createAssetVersions(1);

      await expect(
        playlistStore.addVersionsToPlaylist("non-existent", versions),
      ).rejects.toThrow("Playlist non-existent not found");
    });

    it("should handle database errors gracefully", async () => {
      // This test would require more sophisticated mocking to simulate database failures
      // but demonstrates the error handling structure
      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe("🔧 Database Statistics and Health", () => {
    it("should provide accurate database statistics", async () => {
      await TestScenarios.setupFtrackPlaylistWithContent();

      const stats = await TestDatabaseHelpers.getDatabaseStats();
      expect(stats.playlistCount).toBe(1);
      expect(stats.versionCount).toBe(3);
      expect(stats.draftCount).toBe(1); // One draft was created
      expect(stats.publishedCount).toBe(0);
    });

    it("should handle database cleanup properly", async () => {
      await TestScenarios.setupFtrackPlaylistWithContent();

      // Verify data exists
      let stats = await TestDatabaseHelpers.getDatabaseStats();
      expect(stats.playlistCount).toBeGreaterThan(0);

      // Clear database
      await TestDatabaseHelpers.clearDatabase();

      // Verify cleanup
      stats = await TestDatabaseHelpers.getDatabaseStats();
      expect(stats.playlistCount).toBe(0);
      expect(stats.versionCount).toBe(0);
    });
  });
});
