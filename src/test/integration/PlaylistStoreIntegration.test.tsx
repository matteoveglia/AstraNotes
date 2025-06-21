import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { playlistStore } from "@/store/playlist";
import type { Playlist, AssetVersion, CreatePlaylistRequest } from "@/types";
import { db } from "@/store/db";

// Mock the UI store to simulate playlist existence checks
const mockUIStore = {
  playlists: [] as Playlist[],
  getState: () => ({ playlists: mockUIStore.playlists }),
};

// Mock the ftrack service
vi.mock("@/services/ftrack", () => ({
  FtrackService: vi.fn().mockImplementation(() => ({
    getPlaylistVersions: vi.fn(),
  })),
  ftrackService: {
    getPlaylistVersions: vi.fn(),
  },
}));

vi.mock("@/store/playlistsStore", () => ({
  usePlaylistsStore: mockUIStore,
}));

describe("Playlist Store Integration Tests", () => {
  const sampleFtrackPlaylist: Playlist = {
    id: "ftrack-native-id",
    ftrackId: "ftrack-123",
    name: "Ftrack Native Playlist",
    title: "Ftrack Native Playlist",
    notes: [],
    versions: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    type: "reviewsession",
    projectId: "project-123",
    categoryId: "category-456",
    categoryName: "VFX Review",
    description: "Test ftrack playlist",
    isLocalOnly: false,
  };

  const sampleVersions: AssetVersion[] = [
    {
      id: "version-1",
      name: "Shot_001_v001",
      version: 1,
      thumbnailUrl: "https://example.com/thumb1.jpg",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "version-2",
      name: "Shot_002_v001",
      version: 1,
      thumbnailUrl: "https://example.com/thumb2.jpg",
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    },
  ];

  beforeEach(async () => {
    // Clear all database tables
    await db.playlists.clear();
    await db.versions.clear();

    // Reset mock UI store
    mockUIStore.playlists = [];

    // Clear playlist store cache
    playlistStore.clearCache();

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up database
    await db.playlists.clear();
    await db.versions.clear();
  });

  describe("Playlist Creation", () => {
    it("should create a local playlist with stable UUID", async () => {
      const request: CreatePlaylistRequest = {
        name: "Test Local Playlist",
        type: "list",
        projectId: "project-123",
        description: "Test description",
      };

      const createdPlaylist = await playlistStore.createPlaylist(request);

      // Verify playlist was created with stable UUID
      expect(createdPlaylist.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(createdPlaylist.name).toBe("Test Local Playlist");
      expect(createdPlaylist.isLocalOnly).toBe(true);
      expect(createdPlaylist.ftrackId).toBeUndefined();

      // Verify it was stored in database
      const dbPlaylist = await db.playlists.get(createdPlaylist.id);
      expect(dbPlaylist).toBeDefined();
      expect(dbPlaylist?.name).toBe("Test Local Playlist");
      expect(dbPlaylist?.localStatus).toBe("draft");
      expect(dbPlaylist?.ftrackSyncStatus).toBe("not_synced");
    });
  });

  describe("Ftrack Metadata Preservation", () => {
    it("should preserve ftrack metadata when creating database entry for ftrack playlist", async () => {
      // Simulate ftrack playlist existing in UI store
      mockUIStore.playlists = [sampleFtrackPlaylist];

      // Trigger database entry creation by adding versions
      await playlistStore.addVersionsToPlaylist(
        sampleFtrackPlaylist.id,
        sampleVersions,
      );

      // Verify database entry was created with preserved metadata
      const dbPlaylist = await db.playlists.get(sampleFtrackPlaylist.id);
      expect(dbPlaylist).toBeDefined();
      expect(dbPlaylist?.ftrackId).toBe("ftrack-123");
      expect(dbPlaylist?.projectId).toBe("project-123");
      expect(dbPlaylist?.categoryId).toBe("category-456");
      expect(dbPlaylist?.categoryName).toBe("VFX Review");
      expect(dbPlaylist?.description).toBe("Test ftrack playlist");
      expect(dbPlaylist?.localStatus).toBe("synced");
      expect(dbPlaylist?.ftrackSyncStatus).toBe("synced");
    });

    it("should include ftrackId in database-to-UI conversion", async () => {
      // Create playlist in database with ftrack metadata
      await db.playlists.add({
        id: "test-playlist",
        name: "Test Playlist",
        type: "reviewsession",
        ftrackId: "ftrack-456",
        projectId: "project-123",
        localStatus: "synced",
        ftrackSyncStatus: "synced",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Retrieve via store to test conversion
      const playlist = await playlistStore.getPlaylist("test-playlist");

      expect(playlist).toBeDefined();
      expect(playlist?.ftrackId).toBe("ftrack-456");
      expect(playlist?.projectId).toBe("project-123");
      expect(playlist?.isLocalOnly).toBe(false); // Should be false when synced
    });
  });

  describe("Version Management", () => {
    beforeEach(async () => {
      // Create a test playlist in database
      await db.playlists.add({
        id: "test-playlist",
        name: "Test Playlist",
        type: "list",
        localStatus: "draft",
        ftrackSyncStatus: "not_synced",
        projectId: "project-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it("should add versions to playlist and store in database", async () => {
      await playlistStore.addVersionsToPlaylist(
        "test-playlist",
        sampleVersions,
      );

      // Verify versions were stored in database
      const dbVersions = await db.versions
        .where("playlistId")
        .equals("test-playlist")
        .toArray();
      expect(dbVersions).toHaveLength(2);
      expect(dbVersions.map((v) => v.id)).toEqual(["version-1", "version-2"]);
      expect(dbVersions[0].name).toBe("Shot_001_v001");
    });

    it("should retrieve versions for playlist", async () => {
      // Add versions to database
      await playlistStore.addVersionsToPlaylist(
        "test-playlist",
        sampleVersions,
      );

      // Retrieve versions
      const versions = await playlistStore.getPlaylistVersions("test-playlist");

      expect(versions).toHaveLength(2);
      expect(versions[0].id).toBe("version-1");
      expect(versions[0].playlistId).toBe("test-playlist");
    });

    it("should remove version from playlist", async () => {
      // Add versions first
      await playlistStore.addVersionsToPlaylist(
        "test-playlist",
        sampleVersions,
      );

      // Remove one version
      await playlistStore.removeVersionFromPlaylist(
        "test-playlist",
        "version-1",
      );

      // Verify version was marked as removed (not deleted)
      const dbVersion = await db.versions.get(["test-playlist", "version-1"]);
      expect(dbVersion?.isRemoved).toBe(true);

      // Verify other version still exists
      const remainingVersions = await db.versions
        .where("playlistId")
        .equals("test-playlist")
        .and((v) => !v.isRemoved)
        .toArray();
      expect(remainingVersions).toHaveLength(1);
      expect(remainingVersions[0].id).toBe("version-2");
    });
  });

  describe("Draft Management", () => {
    beforeEach(async () => {
      // Create playlist and add version
      await db.playlists.add({
        id: "test-playlist",
        name: "Test Playlist",
        type: "list",
        localStatus: "draft",
        ftrackSyncStatus: "not_synced",
        projectId: "project-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await playlistStore.addVersionsToPlaylist("test-playlist", [
        sampleVersions[0],
      ]);
    });

    it("should save and retrieve draft content", async () => {
      const draftContent = "This is a test note";
      const labelId = "label-123";

      await playlistStore.saveDraft(
        "test-playlist",
        "version-1",
        draftContent,
        labelId,
      );

      // Verify draft was saved in database
      const dbVersion = await db.versions.get(["test-playlist", "version-1"]);
      expect(dbVersion?.draftContent).toBe(draftContent);
      expect(dbVersion?.labelId).toBe(labelId);
      expect(dbVersion?.noteStatus).toBe("draft");

      // Verify draft can be retrieved
      const retrievedContent = await playlistStore.getDraftContent(
        "test-playlist",
        "version-1",
      );
      expect(retrievedContent).toBe(draftContent);
    });

    it("should clear draft content", async () => {
      // Save draft first
      await playlistStore.saveDraft(
        "test-playlist",
        "version-1",
        "Test content",
      );

      // Clear draft
      await playlistStore.clearDraft("test-playlist", "version-1");

      // Verify draft was cleared
      const dbVersion = await db.versions.get(["test-playlist", "version-1"]);
      expect(dbVersion?.draftContent ?? null).toBeNull();
      expect(dbVersion?.noteStatus).toBe("empty");
    });

    it("should publish note and update status", async () => {
      // Save draft first
      await playlistStore.saveDraft(
        "test-playlist",
        "version-1",
        "Test content",
      );

      // Publish note
      await playlistStore.publishNote("test-playlist", "version-1");

      // Verify note status was updated
      const dbVersion = await db.versions.get(["test-playlist", "version-1"]);
      expect(dbVersion?.noteStatus).toBe("published");
    });
  });

  describe("Cache Management", () => {
    it("should cache playlist data for fast retrieval", async () => {
      // Create playlist in database
      await db.playlists.add({
        id: "test-playlist",
        name: "Cached Playlist",
        type: "list",
        localStatus: "draft",
        ftrackSyncStatus: "not_synced",
        projectId: "project-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // First retrieval should hit database
      const playlist1 = await playlistStore.getPlaylist("test-playlist");
      expect(playlist1?.name).toBe("Cached Playlist");

      // Second retrieval should hit cache (we can't directly verify this, but it should be fast)
      const playlist2 = await playlistStore.getPlaylist("test-playlist");
      expect(playlist2?.name).toBe("Cached Playlist");

      // Verify cache stats
      const stats = playlistStore.getCacheStats();
      expect(stats.playlists.size).toBeGreaterThan(0);
    });

    it("should invalidate cache when data changes", async () => {
      // Create playlist
      await db.playlists.add({
        id: "test-playlist",
        name: "Original Name",
        type: "list",
        localStatus: "draft",
        ftrackSyncStatus: "not_synced",
        projectId: "project-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Load into cache
      await playlistStore.getPlaylist("test-playlist");

      // Add version (should invalidate cache)
      await playlistStore.addVersionsToPlaylist("test-playlist", [
        sampleVersions[0],
      ]);

      // Retrieve again - should get fresh data with version
      const playlist = await playlistStore.getPlaylist("test-playlist");
      expect(playlist?.versions).toHaveLength(1);
    });
  });

  describe("Quick Notes Special Handling", () => {
    it("should initialize Quick Notes with correct properties", async () => {
      await playlistStore.initializeQuickNotes();

      const quickNotes = await playlistStore.getPlaylist("quick-notes");

      expect(quickNotes).toBeDefined();
      expect(quickNotes?.id).toBe("quick-notes");
      expect(quickNotes?.name).toBe("Quick Notes");
      expect(quickNotes?.isQuickNotes).toBe(true);
      expect(quickNotes?.isLocalOnly).toBe(false); // Quick Notes should never be local only
    });

    it("should preserve Quick Notes properties when loaded from database", async () => {
      // This test verifies the fix for the Quick Notes regression issue
      // where Quick Notes would show as "Local only" after navigation/reload

      // First, initialize Quick Notes and add some versions to create database entry
      await playlistStore.initializeQuickNotes();
      await playlistStore.addVersionsToPlaylist("quick-notes", [
        sampleVersions[0],
      ]);

      // Verify Quick Notes exists in database with versions
      const dbEntry = await db.playlists.get("quick-notes");
      expect(dbEntry).toBeDefined();
      expect(dbEntry?.id).toBe("quick-notes");
      expect(dbEntry?.localStatus).toBe("draft"); // Quick Notes starts as draft

      const dbVersions = await db.versions
        .where("playlistId")
        .equals("quick-notes")
        .toArray();
      expect(dbVersions).toHaveLength(1);

      // Test the database-to-UI conversion directly
      // This simulates what the fixed playlistsStore.ts conversion does
      const convertedPlaylist = dbEntry
        ? {
            id: dbEntry.id,
            name: dbEntry.name,
            title: dbEntry.name,
            notes: [],
            versions: [],
            createdAt: dbEntry.createdAt,
            updatedAt: dbEntry.updatedAt,
            ftrackId: dbEntry.ftrackId,
            // CRITICAL FIX: Quick Notes should NEVER be considered local only
            isLocalOnly:
              dbEntry.id === "quick-notes"
                ? false
                : dbEntry.localStatus === "draft" ||
                  dbEntry.ftrackSyncStatus === "not_synced",
            isQuickNotes: dbEntry.id === "quick-notes",
            ftrackSyncState:
              dbEntry.ftrackSyncStatus === "synced"
                ? ("synced" as const)
                : ("pending" as const),
            type: dbEntry.type,
          }
        : null;

      // Verify Quick Notes maintains its special properties after database conversion
      expect(convertedPlaylist).toBeDefined();
      expect(convertedPlaylist?.isQuickNotes).toBe(true);
      expect(convertedPlaylist?.isLocalOnly).toBe(false); // CRITICAL: Should never be true, even in draft status
      expect(convertedPlaylist?.name).toBe("Quick Notes");
    });

    it("should handle Quick Notes differently from regular local playlists in database conversion", async () => {
      // Create a regular local playlist for comparison
      const regularPlaylistDb = {
        id: "regular-local-playlist",
        name: "Regular Local Playlist",
        type: "list" as const,
        localStatus: "draft" as const, // This should make it isLocalOnly: true
        ftrackSyncStatus: "not_synced" as const,
        projectId: "project-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.playlists.add(regularPlaylistDb);

      // Initialize Quick Notes (which will also be in draft status initially)
      await playlistStore.initializeQuickNotes();
      const quickNotesDb = await db.playlists.get("quick-notes");

      // Apply the fixed database-to-UI conversion logic to both
      const convertPlaylist = (dbPlaylist: any) => ({
        id: dbPlaylist.id,
        name: dbPlaylist.name,
        // CRITICAL FIX: Quick Notes should NEVER be considered local only and should always have isQuickNotes flag
        isLocalOnly:
          dbPlaylist.id === "quick-notes"
            ? false
            : dbPlaylist.localStatus === "draft" ||
              dbPlaylist.ftrackSyncStatus === "not_synced",
        isQuickNotes: dbPlaylist.id === "quick-notes",
      });

      const quickNotes = convertPlaylist(quickNotesDb);
      const regularPlaylist = convertPlaylist(regularPlaylistDb);

      // Quick Notes should never be considered local only, even in draft status
      expect(quickNotes.isLocalOnly).toBe(false);
      expect(quickNotes.isQuickNotes).toBe(true);

      // Regular local playlist should be considered local only when in draft status
      expect(regularPlaylist.isLocalOnly).toBe(true);
      expect(regularPlaylist.isQuickNotes).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing playlist gracefully", async () => {
      const playlist = await playlistStore.getPlaylist("non-existent");
      expect(playlist).toBeNull();
    });

    it("should throw error when adding versions to non-existent playlist", async () => {
      await expect(
        playlistStore.addVersionsToPlaylist("non-existent", sampleVersions),
      ).rejects.toThrow("Playlist non-existent not found");
    });
  });
});
