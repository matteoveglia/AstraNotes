import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchThumbnail,
  clearThumbnailCache,
  _testing,
} from "@/services/thumbnailService";

// Mock the thumbnail settings store
vi.mock("../store/thumbnailSettingsStore", () => ({
  useThumbnailSettingsStore: {
    getState: () => ({ size: 128 }),
  },
}));

// Mock the Tauri HTTP plugin with an inline function
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    }),
  ),
}));

describe("thumbnailService", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock URL methods on the global object
    global.URL = {
      createObjectURL: vi.fn(() => "mock-blob-url"),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof global.URL;

    // Clear the thumbnail cache before each test
    _testing.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchThumbnail", () => {
    it("should return null when component ID is null or undefined", async () => {
      // Test with null
      let result = await fetchThumbnail(null, {} as any);
      expect(result).toBeNull();

      // Test with undefined
      result = await fetchThumbnail(undefined, {} as any);
      expect(result).toBeNull();
    });

    it("should return cached thumbnail if available", async () => {
      // Add a thumbnail to the cache
      _testing.addToCache("test-component-id-128", "mock-blob-url");

      // Create mock session
      const mockSession = {
        thumbnailUrl: vi
          .fn()
          .mockReturnValue("https://example.com/thumbnail/123"),
      };

      // Call the function
      const result = await fetchThumbnail(
        "test-component-id",
        mockSession as any,
      );

      // Verify it returned the cached URL
      expect(result).toBe("mock-blob-url");
      expect(mockSession.thumbnailUrl).not.toHaveBeenCalled();
    });

    it("should fetch and cache thumbnail successfully", async () => {
      // Import the mocked fetch function
      const { fetch } = await import("@tauri-apps/plugin-http");

      // Create mock session
      const mockSession = {
        thumbnailUrl: vi
          .fn()
          .mockReturnValue("https://example.com/thumbnail/123"),
      };

      // Call the function
      const result = await fetchThumbnail(
        "test-component-id",
        mockSession as any,
      );

      // Verify the correct methods were called
      expect(mockSession.thumbnailUrl).toHaveBeenCalledWith(
        "test-component-id",
        { size: 128 },
      );
      expect(fetch).toHaveBeenCalledWith("https://example.com/thumbnail/123");
      expect(URL.createObjectURL).toHaveBeenCalled();

      // Check the result and cache
      expect(result).toBe("mock-blob-url");
      expect(_testing.getCacheSize()).toBe(1);
    });

    it("should handle fetch errors", async () => {
      // Import the mocked fetch function
      const { fetch } = await import("@tauri-apps/plugin-http");

      // Make it throw an error for this test only
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Fetch error"));

      // Create mock session
      const mockSession = {
        thumbnailUrl: vi
          .fn()
          .mockReturnValue("https://example.com/thumbnail/123"),
      };

      // Call the function
      const result = await fetchThumbnail(
        "test-component-id",
        mockSession as any,
      );

      // Verify error was handled correctly
      expect(result).toBeNull();
      expect(mockSession.thumbnailUrl).toHaveBeenCalled();
    });
  });

  describe("clearThumbnailCache", () => {
    it("should clear the thumbnail cache and revoke all blob URLs", () => {
      // Add test URLs to the cache
      _testing.addToCache("key1", "blob-url-1");
      _testing.addToCache("key2", "blob-url-2");

      // Call the function
      clearThumbnailCache();

      // Verify revoke was called for each URL
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob-url-1");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob-url-2");
      expect(_testing.getCacheSize()).toBe(0);
    });

    it("should handle errors when revoking blob URLs", () => {
      // Add test URLs to the cache
      _testing.addToCache("key1", "blob-url-1");
      _testing.addToCache("key2", "blob-url-2");

      // Make the first call throw an error
      vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => {
        throw new Error("Failed to revoke URL");
      });

      // Spy on console.error
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Call the function
      clearThumbnailCache();

      // Verify error handling
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(_testing.getCacheSize()).toBe(0);

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
