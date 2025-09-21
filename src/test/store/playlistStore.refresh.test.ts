import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/store/db";
import { playlistStore, PlaylistRepository } from "@/store/playlist";
import type { PlaylistEntity } from "@/store/playlist/types";

// Mock ftrack service with controllable response
vi.mock("@/services/ftrack/FtrackPlaylistService", () => {
  return {
    ftrackPlaylistService: {
      getPlaylistVersions: vi.fn(async (_playlistId: string) => []),
    },
  };
});

const mockedService = await import("@/services/ftrack/FtrackPlaylistService");

describe("PlaylistStore refresh flows", () => {
  const repo = new PlaylistRepository();
  const now = new Date().toISOString();

  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();
    vi.clearAllMocks();
  });

  async function seedSyncedPlaylist(id: string) {
    const entity: PlaylistEntity = {
      id,
      name: "Seeded",
      type: "list",
      localStatus: "synced",
      ftrackSyncStatus: "synced",
      ftrackId: "ft-123",
      projectId: "proj-1",
      createdAt: now,
      updatedAt: now,
    };
    await repo.createPlaylist(entity);
    return entity;
  }

  it("refreshPlaylist computes added/removed without applying changes", async () => {
    const id = "plist-refresh-1";
    await seedSyncedPlaylist(id);

    // DB has A, B
    await playlistStore.addVersionsToPlaylist(id, [
      { id: "A", name: "A", version: 1, createdAt: now, updatedAt: now },
      { id: "B", name: "B", version: 1, createdAt: now, updatedAt: now },
    ]);

    // Fresh has B, C
    (mockedService.ftrackPlaylistService.getPlaylistVersions as any).mockResolvedValue(
      [
        { id: "B", name: "B", version: 1, createdAt: now, updatedAt: now },
        { id: "C", name: "C", version: 1, createdAt: now, updatedAt: now },
      ],
    );

    const result = await (playlistStore as any).refreshPlaylist(id);
    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
    expect(result.removedCount).toBe(1);

    // DB unchanged: A still not removed, C not present yet
    const dbVersions = await repo.getPlaylistVersions(id);
    const ids = new Set(dbVersions.map((v) => v.id));
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(true);
    expect(ids.has("C")).toBe(false);
    const aEntity = dbVersions.find((v) => v.id === "A")!;
    expect(aEntity.isRemoved).not.toBe(true);
  });

  it("applyPlaylistRefresh applies additions/removals to DB", async () => {
    const id = "plist-refresh-apply";
    await seedSyncedPlaylist(id);

    // DB has A, B
    await playlistStore.addVersionsToPlaylist(id, [
      { id: "A", name: "A", version: 1, createdAt: now, updatedAt: now },
      { id: "B", name: "B", version: 1, createdAt: now, updatedAt: now },
    ]);

    const fresh = [
      { id: "B", name: "B", version: 1, createdAt: now, updatedAt: now },
      { id: "C", name: "C", version: 1, createdAt: now, updatedAt: now },
    ];
    const added = [fresh[1]]; // C
    const removed = [{ id: "A", name: "A", version: 1, createdAt: now, updatedAt: now }];

    const applied = await (playlistStore as any).applyPlaylistRefresh(
      id,
      fresh,
      added as any,
      removed as any,
    );
    expect(applied.success).toBe(true);

    const dbVersions = await repo.getPlaylistVersions(id);
    const ids = new Set(dbVersions.map((v) => v.id));
    expect(ids.has("B")).toBe(true);
    expect(ids.has("C")).toBe(true);

    // Verify A is now soft-removed
    // Need to query including removed
    const rawA = await (repo as any).getVersion(id, "A");
    expect(rawA?.isRemoved).toBe(true);
  });
});
