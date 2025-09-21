/**
 * @fileoverview AutoRefreshIntegration.test.tsx
 * Integration tests for auto-refresh functionality
 * Tests the interaction between settings store, playlist store, and auto-refresh
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useSettings } from "../../store/settingsStore";
import { playlistStore } from "../../store/playlist";

// Mock the playlist store
vi.mock("../../store/playlist", () => ({
  playlistStore: {
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn(),
    isAutoRefreshActive: vi.fn(() => false),
    getCurrentAutoRefreshPlaylistId: vi.fn(() => null),
  },
}));

describe("Auto-Refresh Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset settings to default
    useSettings.setState({
      settings: {
        serverUrl: "",
        apiKey: "",
        apiUser: "",
        defaultLabelId: undefined,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should start auto-refresh when enabled and playlist is not Quick Notes", async () => {
    const mockStartAutoRefresh = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );

    const { result } = renderHook(() =>
      useAutoRefresh({
        playlistId: "test-playlist-id",
        isEnabled: true,
      }),
    );

    // Wait for effects to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).toHaveBeenCalledWith(
      "test-playlist-id",
      undefined,
    );
  });

  it("should not start auto-refresh for Quick Notes playlist", async () => {
    const mockStartAutoRefresh = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );

    renderHook(() =>
      useAutoRefresh({
        playlistId: "quick-notes-test-project",
        isEnabled: true,
      }),
    );

    // Wait for effects to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });

  it("should stop auto-refresh when disabled in settings", async () => {
    const mockStartAutoRefresh = vi.fn();
    const mockStopAutoRefresh = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );
    vi.mocked(playlistStore.stopAutoRefresh).mockImplementation(
      mockStopAutoRefresh,
    );

    const { rerender } = renderHook(() =>
      useAutoRefresh({
        playlistId: "test-playlist-id",
        isEnabled: true,
      }),
    );

    // Wait for initial effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).toHaveBeenCalledWith(
      "test-playlist-id",
      undefined,
    );

    // Disable auto-refresh in settings
    act(() => {
      useSettings.setState({
        settings: {
          serverUrl: "",
          apiKey: "",
          apiUser: "",
          defaultLabelId: undefined,
        },
      });
    });

    // Force re-render
    rerender();

    // Wait for effect to respond to settings change
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStopAutoRefresh).toHaveBeenCalled();
  });

  it("should stop auto-refresh when component is disabled", async () => {
    const mockStartAutoRefresh = vi.fn();
    const mockStopAutoRefresh = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );
    vi.mocked(playlistStore.stopAutoRefresh).mockImplementation(
      mockStopAutoRefresh,
    );

    const { rerender } = renderHook(
      ({ isEnabled }) =>
        useAutoRefresh({
          playlistId: "test-playlist-id",
          isEnabled,
        }),
      {
        initialProps: { isEnabled: true },
      },
    );

    // Wait for initial effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).toHaveBeenCalledWith(
      "test-playlist-id",
      undefined,
    );

    // Disable the hook
    rerender({ isEnabled: false });

    // Wait for effect to respond to prop change
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStopAutoRefresh).toHaveBeenCalled();
  });

  it("should restart auto-refresh when playlist changes", async () => {
    const mockStartAutoRefresh = vi.fn();
    const mockStopAutoRefresh = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );
    vi.mocked(playlistStore.stopAutoRefresh).mockImplementation(
      mockStopAutoRefresh,
    );

    const { rerender } = renderHook(
      ({ playlistId }) =>
        useAutoRefresh({
          playlistId,
          isEnabled: true,
        }),
      {
        initialProps: { playlistId: "playlist-1" },
      },
    );

    // Wait for initial effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).toHaveBeenCalledWith("playlist-1", undefined);
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);

    // Change playlist
    rerender({ playlistId: "playlist-2" });

    // Wait for effect to respond to playlist change
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Should stop old auto-refresh and start new one
    expect(mockStopAutoRefresh).toHaveBeenCalled();
    expect(mockStartAutoRefresh).toHaveBeenCalledWith("playlist-2", undefined);
  });

  it("should call onRefreshCompleted callback when provided", async () => {
    const mockStartAutoRefresh = vi.fn();
    const mockCallback = vi.fn();
    vi.mocked(playlistStore.startAutoRefresh).mockImplementation(
      mockStartAutoRefresh,
    );

    renderHook(() =>
      useAutoRefresh({
        playlistId: "test-playlist-id",
        isEnabled: true,
        onRefreshCompleted: mockCallback,
      }),
    );

    // Wait for effects to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockStartAutoRefresh).toHaveBeenCalledWith(
      "test-playlist-id",
      mockCallback,
    );
  });

  it("should provide store state through return values", () => {
    const mockIsActive = vi.fn(() => true);
    const mockGetCurrentId = vi.fn(() => "test-playlist");
    vi.mocked(playlistStore.isAutoRefreshActive).mockImplementation(
      mockIsActive,
    );
    vi.mocked(playlistStore.getCurrentAutoRefreshPlaylistId).mockImplementation(
      mockGetCurrentId,
    );

    const { result } = renderHook(() =>
      useAutoRefresh({
        playlistId: "test-playlist-id",
        isEnabled: true,
      }),
    );

    expect(result.current.isAutoRefreshActive).toBe(true);
    expect(result.current.currentAutoRefreshPlaylistId).toBe("test-playlist");
    expect(typeof result.current.startAutoRefresh).toBe("function");
    expect(typeof result.current.stopAutoRefresh).toBe("function");
  });
});
