import { vi } from "vitest";
import type { Playlist, AssetVersion } from "@/types";
import { db } from "@/store/db";
import { playlistStore } from "@/store/playlist";

/**
 * Test data factories for creating mock objects
 */
export const TestDataFactory = {
  /**
   * Creates a mock ftrack playlist with proper metadata
   */
  createFtrackPlaylist(overrides: Partial<Playlist> = {}): Playlist {
    return {
      id: "ftrack-playlist-uuid",
      ftrackId: "ftrack-123",
      name: "Test Ftrack Playlist",
      title: "Test Ftrack Playlist",
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
      ...overrides,
    };
  },

  /**
   * Creates a mock local playlist
   */
  createLocalPlaylist(overrides: Partial<Playlist> = {}): Playlist {
    return {
      id: "local-playlist-uuid",
      name: "Test Local Playlist",
      title: "Test Local Playlist",
      notes: [],
      versions: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      type: "list",
      projectId: "project-123",
      isLocalOnly: true,
      ...overrides,
    };
  },

  /**
   * Creates mock asset versions
   */
  createAssetVersions(
    count: number,
    overrides: Partial<AssetVersion> = {},
  ): AssetVersion[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `version-${i + 1}`,
      name: `Shot_00${i + 1}_v001`,
      version: 1,
      thumbnailUrl: `https://example.com/thumb${i + 1}.jpg`,
      createdAt: `2024-01-0${i + 1}T00:00:00Z`,
      updatedAt: `2024-01-0${i + 1}T00:00:00Z`,
      ...overrides,
    }));
  },

  /**
   * Creates manually added versions with different IDs
   */
  createManualVersions(count: number): AssetVersion[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `manual-version-${i + 1}`,
      name: `Manual_Shot_00${i + 1}_v001`,
      version: 1,
      thumbnailUrl: `https://example.com/manual-thumb${i + 1}.jpg`,
      createdAt: `2024-01-0${i + 1}T00:00:00Z`,
      updatedAt: `2024-01-0${i + 1}T00:00:00Z`,
      manuallyAdded: true,
    }));
  },
};

/**
 * Test scenario setups for complex workflows
 */
export class TestScenarios {
  /**
   * Sets up a complete ftrack playlist with versions and drafts
   */
  static async setupFtrackPlaylistWithContent(): Promise<{
    playlist: Playlist;
    versions: AssetVersion[];
    draftVersionId: string;
  }> {
    // Create playlist using the store
    const playlist = await playlistStore.createPlaylist({
      name: "Test Ftrack Playlist With Content",
      type: "reviewsession",
      projectId: "project-123",
      categoryId: "category-456",
      categoryName: "VFX Review",
      description: "Test playlist with content",
      ftrackId: "ftrack-456",
    });

    const versions = TestDataFactory.createAssetVersions(3);

    // Add versions
    await playlistStore.addVersionsToPlaylist(playlist.id, versions);

    // Add a draft to one version
    const draftVersionId = versions[0].id;
    await playlistStore.saveDraft(
      playlist.id,
      draftVersionId,
      "Test draft content",
      "label-123",
    );

    return { playlist, versions, draftVersionId };
  }

  /**
   * Sets up a playlist with mixed content (ftrack + manual versions)
   */
  static async setupMixedContentPlaylist(): Promise<{
    playlist: Playlist;
    ftrackVersions: AssetVersion[];
    manualVersions: AssetVersion[];
  }> {
    // Create playlist using the store
    const playlist = await playlistStore.createPlaylist({
      name: "Test Mixed Content Playlist",
      type: "reviewsession",
      projectId: "project-123",
      categoryId: "category-789",
      categoryName: "Mixed Review",
      description: "Test mixed content scenario",
      ftrackId: "ftrack-789",
    });

    const ftrackVersions = TestDataFactory.createAssetVersions(2);
    const manualVersions = TestDataFactory.createManualVersions(2);

    // Add both types of versions
    await playlistStore.addVersionsToPlaylist(playlist.id, [
      ...ftrackVersions,
      ...manualVersions,
    ]);

    return { playlist, ftrackVersions, manualVersions };
  }

  /**
   * Sets up a complete refresh scenario with before/after versions
   */
  static async setupRefreshScenario(): Promise<{
    playlist: Playlist;
    originalVersions: AssetVersion[];
    freshVersions: AssetVersion[];
    addedVersions: AssetVersion[];
    removedVersions: AssetVersion[];
    unchangedVersions: AssetVersion[];
  }> {
    // Create a proper ftrack playlist using the store
    const playlist = await playlistStore.createPlaylist({
      name: "Test Refresh Playlist",
      type: "reviewsession",
      projectId: "project-123",
      categoryId: "category-456",
      categoryName: "VFX Review",
      description: "Test refresh scenario",
      ftrackId: "ftrack-123",
    });

    // Original versions (what's currently in playlist)
    const unchangedVersions = TestDataFactory.createAssetVersions(2);
    const removedVersions = TestDataFactory.createAssetVersions(1, {
      id: "removed-version",
    });
    const originalVersions = [...unchangedVersions, ...removedVersions];

    // Fresh versions (what comes back from ftrack)
    const addedVersions = TestDataFactory.createAssetVersions(1, {
      id: "new-version",
    });
    const freshVersions = [...unchangedVersions, ...addedVersions];

    // Add original versions to the playlist
    await playlistStore.addVersionsToPlaylist(playlist.id, originalVersions);

    return {
      playlist,
      originalVersions,
      freshVersions,
      addedVersions,
      removedVersions,
      unchangedVersions,
    };
  }
}

/**
 * Validation helpers for testing workflows
 */
export class TestValidators {
  /**
   * Validates that a playlist has proper ftrack metadata in database
   */
  static async validateFtrackMetadataInDatabase(
    playlistId: string,
    expectedFtrackId: string,
  ): Promise<void> {
    const dbPlaylist = await db.playlists.get(playlistId);

    if (!dbPlaylist) {
      throw new Error(`Playlist ${playlistId} not found in database`);
    }

    if (dbPlaylist.ftrackId !== expectedFtrackId) {
      throw new Error(
        `Expected ftrackId ${expectedFtrackId}, got ${dbPlaylist.ftrackId}`,
      );
    }

    if (dbPlaylist.localStatus !== "synced") {
      throw new Error(
        `Expected localStatus 'synced', got ${dbPlaylist.localStatus}`,
      );
    }

    if (dbPlaylist.ftrackSyncStatus !== "synced") {
      throw new Error(
        `Expected ftrackSyncStatus 'synced', got ${dbPlaylist.ftrackSyncStatus}`,
      );
    }
  }

  /**
   * Validates that versions are properly stored in database
   */
  static async validateVersionsInDatabase(
    playlistId: string,
    expectedVersionIds: string[],
  ): Promise<void> {
    const dbVersions = await db.versions
      .where("playlistId")
      .equals(playlistId)
      .and((v) => !v.isRemoved)
      .toArray();

    const actualVersionIds = dbVersions.map((v) => v.id).sort();
    const expectedSorted = [...expectedVersionIds].sort();

    if (JSON.stringify(actualVersionIds) !== JSON.stringify(expectedSorted)) {
      throw new Error(
        `Version mismatch. Expected: ${expectedSorted.join(", ")}, Got: ${actualVersionIds.join(", ")}`,
      );
    }
  }

  /**
   * Validates that removed versions are marked correctly
   */
  static async validateRemovedVersions(
    playlistId: string,
    expectedRemovedIds: string[],
  ): Promise<void> {
    for (const versionId of expectedRemovedIds) {
      // Use compound key [playlistId, versionId] to query the database
      const dbVersion = await db.versions.get([playlistId, versionId]);
      if (!dbVersion?.isRemoved) {
        throw new Error(`Version ${versionId} should be marked as removed`);
      }
    }
  }

  /**
   * Validates draft content and status
   */
  static async validateDraftContent(
    playlistId: string,
    versionId: string,
    expectedContent: string | null,
    expectedStatus: "empty" | "draft" | "published",
  ): Promise<void> {
    // Use compound key [playlistId, versionId] to query the database
    const dbVersion = await db.versions.get([playlistId, versionId]);

    if (!dbVersion) {
      throw new Error(`Version ${versionId} not found in database`);
    }

    // Handle null vs undefined for cleared content
    const actualContent = dbVersion.draftContent ?? null;
    if (actualContent !== expectedContent) {
      throw new Error(
        `Expected draft content '${expectedContent}', got '${actualContent}'`,
      );
    }

    if (dbVersion.noteStatus !== expectedStatus) {
      throw new Error(
        `Expected note status '${expectedStatus}', got '${dbVersion.noteStatus}'`,
      );
    }
  }
}

/**
 * Database helpers for test setup and cleanup
 */
export class TestDatabaseHelpers {
  /**
   * Clears all test data from database
   */
  static async clearDatabase(): Promise<void> {
    await Promise.all([db.playlists.clear(), db.versions.clear()]);
  }

  /**
   * Gets database statistics for debugging
   */
  static async getDatabaseStats(): Promise<{
    playlistCount: number;
    versionCount: number;
    draftCount: number;
    publishedCount: number;
  }> {
    const [playlists, versions] = await Promise.all([
      db.playlists.toArray(),
      db.versions.toArray(),
    ]);

    const draftCount = versions.filter((v) => v.noteStatus === "draft").length;
    const publishedCount = versions.filter(
      (v) => v.noteStatus === "published",
    ).length;

    return {
      playlistCount: playlists.length,
      versionCount: versions.length,
      draftCount,
      publishedCount,
    };
  }

  /**
   * Dumps database contents for debugging
   */
  static async dumpDatabase(): Promise<{
    playlists: any[];
    versions: any[];
  }> {
    const [playlists, versions] = await Promise.all([
      db.playlists.toArray(),
      db.versions.toArray(),
    ]);

    return { playlists, versions };
  }
}

/**
 * Mock service helpers
 */
export class TestMockHelpers {
  /**
   * Creates a comprehensive ftrack service mock
   */
  static createFtrackServiceMock() {
    return {
      getPlaylistVersions: vi.fn(),
      getPlaylists: vi.fn(),
      getLists: vi.fn(),
      createPlaylist: vi.fn(),
      publishNote: vi.fn(),
    };
  }

  /**
   * Sets up common ftrack service mock responses
   */
  static setupFtrackMocks(
    mock: ReturnType<typeof TestMockHelpers.createFtrackServiceMock>,
  ) {
    mock.getPlaylistVersions.mockResolvedValue(
      TestDataFactory.createAssetVersions(3),
    );
    mock.getPlaylists.mockResolvedValue([
      TestDataFactory.createFtrackPlaylist(),
    ]);
    mock.getLists.mockResolvedValue([]);
  }
}

/**
 * Console helpers for test isolation
 */
export class TestConsoleHelpers {
  private static originalConsole: {
    log: typeof console.log;
    debug: typeof console.debug;
    warn: typeof console.warn;
    error: typeof console.error;
  };

  /**
   * Mocks all console methods to avoid noise in tests
   */
  static mockConsole() {
    TestConsoleHelpers.originalConsole = {
      log: console.log,
      debug: console.debug,
      warn: console.warn,
      error: console.error,
    };

    console.log = vi.fn();
    console.debug = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  }

  /**
   * Restores original console methods
   */
  static restoreConsole() {
    if (TestConsoleHelpers.originalConsole) {
      console.log = TestConsoleHelpers.originalConsole.log;
      console.debug = TestConsoleHelpers.originalConsole.debug;
      console.warn = TestConsoleHelpers.originalConsole.warn;
      console.error = TestConsoleHelpers.originalConsole.error;
    }
  }

  /**
   * Gets spy for a specific console method
   */
  static getConsoleSpy(method: "log" | "debug" | "warn" | "error") {
    return console[method] as any;
  }
}
