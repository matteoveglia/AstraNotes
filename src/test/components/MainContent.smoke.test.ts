import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/store/db";
import { playlistStore, PlaylistRepository } from "@/store/playlist";
import type { PlaylistEntity } from "@/store/playlist/types";

// Mock ftrack service
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
  ftrackPlaylistService: {
    getPlaylistVersions: vi.fn(async () => []),
  },
}));

describe("MainContent local-only init smoke test", () => {
  const repo = new PlaylistRepository();
  const now = new Date().toISOString();

  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    vi.clearAllMocks();
  });

  it("can initialize and retrieve local playlist with versions", async () => {
    const playlistId = "local-playlist-test";
    const entity: PlaylistEntity = {
      id: playlistId,
      name: "Local Test",
      type: "list",
      localStatus: "draft",
      ftrackSyncStatus: "not_synced",
      projectId: "test-project",
      createdAt: now,
      updatedAt: now,
    };

    // Create playlist and add versions
    await repo.createPlaylist(entity);
    await playlistStore.addVersionsToPlaylist(playlistId, [
      { id: "v1", name: "Version 1", version: 1, createdAt: now, updatedAt: now },
    ]);

    // Verify we can retrieve it (this is what MainContent does during init)
    const playlist = await playlistStore.getPlaylist(playlistId);
    expect(playlist).toBeTruthy();
    expect(playlist!.id).toBe(playlistId);
    expect(playlist!.versions?.length || 0).toBe(1);
    expect(playlist!.versions![0].id).toBe("v1");
    expect(playlist!.isLocalOnly).toBe(true);
  });
});
