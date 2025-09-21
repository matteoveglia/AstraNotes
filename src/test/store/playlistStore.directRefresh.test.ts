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

describe("PlaylistStore directPlaylistRefresh deleted-in-ftrack", () => {
  const repo = new PlaylistRepository();
  const now = new Date().toISOString();

  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    vi.clearAllMocks();
  });

  it("preserves snapshot when playlist deleted in ftrack", async () => {
    const id = "deleted-playlist";
    const entity: PlaylistEntity = {
      id,
      name: "Deleted Test",
      type: "list",
      localStatus: "synced",
      ftrackSyncStatus: "synced",
      ftrackId: "ft-deleted",
      projectId: "proj",
      deletedInFtrack: true, // Mark as deleted in ftrack
      createdAt: now,
      updatedAt: now,
    };

    await repo.createPlaylist(entity);
    await playlistStore.addVersionsToPlaylist(id, [
      { id: "v1", name: "Version 1", version: 1, createdAt: now, updatedAt: now },
      { id: "v2", name: "Version 2", version: 1, createdAt: now, updatedAt: now },
    ]);

    // First get to populate cache
    const cachedPlaylist = await playlistStore.getPlaylist(id);
    expect(cachedPlaylist?.versions?.length || 0).toBe(2);

    // Direct refresh should remove versions from DB but preserve cache snapshot
    const result = await (playlistStore as any).directPlaylistRefresh(id);
    expect(result.success).toBe(true);
    expect(result.removedCount).toBe(2);

    // Cache should still have the versions (snapshot preserved)
    const cachedAfterRefresh = await playlistStore.getPlaylist(id);
    expect(cachedAfterRefresh?.versions?.length || 0).toBe(2);

    // DB should have the versions soft-deleted; verify via removed list
    const dbRemoved = await repo.getRemovedVersions(id);
    expect(dbRemoved.length).toBe(2);
    expect(dbRemoved.every(v => v.isRemoved)).toBe(true);
  });
});
