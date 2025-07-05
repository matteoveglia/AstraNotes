import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistModifications } from "@/features/playlists/hooks/usePlaylistModifications";
import { playlistStore } from "@/store/playlist";
import { ftrackPlaylistService } from "@/services/ftrack/FtrackPlaylistService";
import type { Playlist, AssetVersion } from "@/types";

// Mock ftrackPlaylistService
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: {
    getPlaylistVersions: vi.fn(),
  },
}));

// Mock console methods to avoid noise in tests
const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

describe("Playlist Refresh Workflow Integration", () => {
  const mockFtrackPlaylist: Playlist = {
    id: "test-playlist-uuid",
    ftrackId: "ftrack-playlist-123",
    name: "Test Ftrack Playlist",
    title: "Test Ftrack Playlist",
    notes: [],
    versions: [
      {
        id: "version-1",
        name: "Shot_001_v001",
        version: 1,
        thumbnailUrl: "https://example.com/thumb1.jpg",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    type: "reviewsession",
    isLocalOnly: false,
  };

  const mockLocalPlaylist: Playlist = {
    id: "local-playlist-uuid",
    name: "Local Test Playlist",
    title: "Local Test Playlist",
    notes: [],
    versions: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    isLocalOnly: true,
  };

  const mockFtrackVersions: AssetVersion[] = [
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
      name: "Shot_001_v002",
      version: 2,
      thumbnailUrl: "https://example.com/thumb2.jpg",
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockClear();
  });

  afterEach(() => {
    // Clean up any playlist store state
    playlistStore.clearCache();
  });

  describe("Ftrack Playlist Refresh", () => {
    it("should successfully refresh ftrack playlist using ftrackId", async () => {
      // Mock the ftrack service to return updated versions
      vi.mocked(ftrackPlaylistService.getPlaylistVersions).mockResolvedValue(
        mockFtrackVersions,
      );

      const { result } = renderHook(() =>
        usePlaylistModifications(mockFtrackPlaylist),
      );

      await act(async () => {
        const success = await result.current.refreshPlaylist();
        expect(success).toBe(true);
      });

      // Verify ftrack API was called with ftrackId, not database UUID
      expect(ftrackPlaylistService.getPlaylistVersions).toHaveBeenCalledWith(
        "ftrack-playlist-123",
      );
      expect(ftrackPlaylistService.getPlaylistVersions).not.toHaveBeenCalledWith(
        "test-playlist-uuid",
      );

      // Verify modifications were detected
      expect(result.current.modifications.added).toBe(1); // version-2 is new
      expect(result.current.modifications.removed).toBe(0);
    });

    it("should detect added and removed versions correctly", async () => {
      // Create playlist with existing version that will be "removed"
      const playlistWithOldVersion: Playlist = {
        ...mockFtrackPlaylist,
        versions: [
          {
            id: "old-version",
            name: "Shot_001_old",
            version: 0,
            thumbnailUrl: "https://example.com/old.jpg",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ],
      };

      vi.mocked(ftrackPlaylistService.getPlaylistVersions).mockResolvedValue(
        mockFtrackVersions,
      );

      const { result } = renderHook(() =>
        usePlaylistModifications(playlistWithOldVersion),
      );

      await act(async () => {
        await result.current.refreshPlaylist();
      });

      // Should detect 2 added (new ftrack versions) and 1 removed (old version not in ftrack)
      expect(result.current.modifications.added).toBe(2);
      expect(result.current.modifications.removed).toBe(1);
      const addedVersionIds = new Set(
        (result.current.modifications.addedVersions || []).map((v) => v.id),
      );
      const removedVersionIds = new Set(
        (result.current.modifications.removedVersions || []).map((v) => v.id),
      );
      expect(addedVersionIds.has("version-1")).toBe(true);
      expect(addedVersionIds.has("version-2")).toBe(true);
      expect(removedVersionIds.has("old-version")).toBe(true);
    });

    it("should preserve manually added versions during refresh", async () => {
      // Create playlist with manually added version
      const playlistWithManualVersion: Playlist = {
        ...mockFtrackPlaylist,
        versions: [
          {
            id: "manual-version",
            name: "Manual_Shot",
            version: 1,
            thumbnailUrl: "https://example.com/manual.jpg",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
            manuallyAdded: true,
          },
        ],
      };

      vi.mocked(ftrackPlaylistService.getPlaylistVersions).mockResolvedValue(
        mockFtrackVersions,
      );

      const { result } = renderHook(() =>
        usePlaylistModifications(playlistWithManualVersion),
      );

      await act(async () => {
        await result.current.refreshPlaylist();
      });

      // Manual version should NOT be counted as removed
      expect(result.current.modifications.added).toBe(2); // Only ftrack versions
      expect(result.current.modifications.removed).toBe(0); // Manual version preserved
      expect(result.current.modifications.removedVersions).toEqual([]);
    });
  });

  describe("Local Playlist Refresh", () => {
    it("should skip refresh for local-only playlists", async () => {
      const { result } = renderHook(() =>
        usePlaylistModifications(mockLocalPlaylist),
      );

      await act(async () => {
        const success = await result.current.refreshPlaylist();
        expect(success).toBe(false);
      });

      // Should not call ftrack API for local playlists
      expect(ftrackPlaylistService.getPlaylistVersions).not.toHaveBeenCalled();

      // Should log appropriate message
      expect(consoleSpy).toHaveBeenCalledWith(
        "Cannot refresh local-only playlist: Local Test Playlist",
      );
    });

    it("should skip refresh for playlists without ftrackId", async () => {
      const playlistWithoutFtrackId: Playlist = {
        ...mockFtrackPlaylist,
        ftrackId: undefined,
      };

      const { result } = renderHook(() =>
        usePlaylistModifications(playlistWithoutFtrackId),
      );

      await act(async () => {
        const success = await result.current.refreshPlaylist();
        expect(success).toBe(false);
      });

      expect(ftrackPlaylistService.getPlaylistVersions).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle ftrack API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Mock API to throw error
      vi.mocked(ftrackPlaylistService.getPlaylistVersions).mockRejectedValue(
        new Error("API Error"),
      );

      const { result } = renderHook(() =>
        usePlaylistModifications(mockFtrackPlaylist),
      );

      await act(async () => {
        const success = await result.current.refreshPlaylist();
        expect(success).toBe(false);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to refresh playlist:",
        expect.any(Error),
      );
      expect(result.current.isRefreshing).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Refresh State Management", () => {
    it("should manage isRefreshing state correctly", async () => {
      vi.mocked(ftrackPlaylistService.getPlaylistVersions).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockFtrackVersions), 10),
          ),
      );

      const { result } = renderHook(() =>
        usePlaylistModifications(mockFtrackPlaylist),
      );

      // Initial state
      expect(result.current.isRefreshing).toBe(false);

      // Start refresh and await it
      await act(async () => {
        await result.current.refreshPlaylist();
      });

      // Should be done refreshing after completion
      expect(result.current.isRefreshing).toBe(false);
    });
  });
});
