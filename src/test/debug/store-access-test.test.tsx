import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";

// Mock the ftrack services
vi.mock("@/services/ftrack/FtrackPlaylistService");
vi.mock("@/services/ftrack/FtrackNoteService");

describe("Store Access Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should access store directly", () => {
    const store = usePlaylistsStore.getState();
    console.log("Direct store access:", store);
    expect(store).toBeDefined();
    expect(typeof store.loadPlaylists).toBe("function");
  });

  it("should access store via renderHook", () => {
    const { result } = renderHook(() => usePlaylistsStore());
    console.log("RenderHook result:", result.current);
    expect(result.current).toBeDefined();
    expect(typeof result.current.loadPlaylists).toBe("function");
  });
});
