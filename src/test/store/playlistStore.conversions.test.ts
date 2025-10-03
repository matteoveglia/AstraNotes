import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/store/db";
import { playlistStore, PlaylistRepository } from "@/store/playlist";
import type { PlaylistEntity } from "@/store/playlist/types";
import { createPlaylistServiceMock } from "@/test/utils/createPlaylistServiceMock";

const { service: playlistService, mocks: playlistMocks } = vi.hoisted(() =>
  createPlaylistServiceMock(),
);

const mockGetPlaylistVersions = playlistMocks.getPlaylistVersions;

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => playlistService),
}));

describe("PlaylistStore conversions", () => {
  const repo = new PlaylistRepository();

  beforeEach(async () => {
    // Clear DB tables between tests
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();
    mockGetPlaylistVersions.mockReset();
    mockGetPlaylistVersions.mockImplementation(async () => []);
  });

  it("maps PlaylistEntity -> Playlist (entityToPlaylist)", async () => {
    const id = "plist-entity-1";
    const now = new Date().toISOString();

    const entity: PlaylistEntity = {
      id,
      name: "My Playlist",
      type: "list",
      localStatus: "draft",
      ftrackSyncStatus: "not_synced",
      projectId: "proj-1",
      createdAt: now,
      updatedAt: now,
    };

    await repo.createPlaylist(entity);

    const ui = await playlistStore.getPlaylist(id);
    expect(ui).toBeTruthy();
    expect(ui!.id).toBe(id);
    expect(ui!.name).toBe("My Playlist");
    expect(ui!.title).toBe("My Playlist");
    // not_synced -> pending
    expect(ui!.ftrackSyncState).toBe("pending");
    // draft local means local-only
    expect(ui!.isLocalOnly).toBe(true);
  });

  it("maps AssetVersion <-> VersionEntity and into UI versions", async () => {
    const id = "plist-versions-1";
    const now = new Date().toISOString();

    const entity: PlaylistEntity = {
      id,
      name: "Versions Test",
      type: "list",
      localStatus: "synced",
      ftrackSyncStatus: "synced",
      projectId: "proj-1",
      createdAt: now,
      updatedAt: now,
    };

    await repo.createPlaylist(entity);

    // Add via PlaylistStore to exercise assetVersionToEntity path
    await playlistStore.addVersionsToPlaylist(id, [
      {
        id: "v1",
        name: "Shot 010",
        version: 1,
        createdAt: now,
        updatedAt: now,
        manuallyAdded: false,
      },
    ]);

    // Verify repository returns VersionEntity with expected mapping
    const entities = await repo.getPlaylistVersions(id);
    expect(entities.length).toBe(1);
    expect(entities[0].id).toBe("v1");
    expect(entities[0].playlistId).toBe(id);
    expect(entities[0].name).toBe("Shot 010");
    expect(entities[0].version).toBe(1);

    // Verify UI playlist includes AssetVersion from entityToAssetVersion mapping
    const ui = await playlistStore.getPlaylist(id);
    expect(ui).toBeTruthy();
    expect(ui!.versions?.length || 0).toBe(1);
    expect(ui!.versions![0].id).toBe("v1");
    expect(ui!.versions![0].name).toBe("Shot 010");
    expect(ui!.versions![0].version).toBe(1);
  });
});
