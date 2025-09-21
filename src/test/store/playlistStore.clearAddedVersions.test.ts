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

describe("PlaylistStore clearAddedVersions", () => {
  const repo = new PlaylistRepository();
  const now = new Date().toISOString();

  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();
    vi.clearAllMocks();
  });

  it("soft-removes manually added versions", async () => {
    const id = "plist-clear-added";
    const entity: PlaylistEntity = {
      id,
      name: "Clear Added Test",
      type: "list",
      localStatus: "draft",
      ftrackSyncStatus: "not_synced",
      projectId: "proj",
      createdAt: now,
      updatedAt: now,
    };
    await repo.createPlaylist(entity);

    // Add mix of auto and manually added versions
    await playlistStore.addVersionsToPlaylist(id, [
      { id: "auto", name: "Auto", version: 1, createdAt: now, updatedAt: now, manuallyAdded: false },
      { id: "manual", name: "Manual", version: 1, createdAt: now, updatedAt: now, manuallyAdded: true },
    ]);

    // Clear added versions
    await playlistStore.clearAddedVersions(id);

    // Active versions should exclude removed ones
    const active = await repo.getPlaylistVersions(id);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe("auto");
    expect(active[0].isRemoved).not.toBe(true);

    // Verify removed (soft-deleted) versions include the manual one
    const removed = await repo.getRemovedVersions(id);
    expect(removed.some(v => v.id === "manual")).toBe(true);
  });
});
