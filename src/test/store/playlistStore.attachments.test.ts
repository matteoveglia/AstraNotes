import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/store/db";
import { playlistStore, PlaylistRepository } from "@/store/playlist";
import type { PlaylistEntity } from "@/store/playlist/types";

const { mockGetPlaylistVersions } = vi.hoisted(() => ({
  mockGetPlaylistVersions: vi.fn(async () => []),
}));

vi.mock("@/services/client", () => ({
  playlistClient: vi.fn(() => ({
    getPlaylistVersions: mockGetPlaylistVersions,
  })),
}));

describe("PlaylistStore attachments", () => {
  const repo = new PlaylistRepository();
  const now = new Date().toISOString();

  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    await db.attachments.clear();
    vi.clearAllMocks();
    mockGetPlaylistVersions.mockReset();
    mockGetPlaylistVersions.mockImplementation(async () => []);
  });

  async function seedPlaylistWithVersion(
    playlistId: string,
    versionId: string,
  ) {
    const entity: PlaylistEntity = {
      id: playlistId,
      name: "Attachments",
      type: "list",
      localStatus: "draft",
      ftrackSyncStatus: "not_synced",
      projectId: "proj",
      createdAt: now,
      updatedAt: now,
    };
    await repo.createPlaylist(entity);
    await playlistStore.addVersionsToPlaylist(playlistId, [
      { id: versionId, name: "A", version: 1, createdAt: now, updatedAt: now },
    ]);
  }

  it("saves and mirrors attachment metadata on version record", async () => {
    const pid = "plist-attach";
    const vid = "v1";
    await seedPlaylistWithVersion(pid, vid);

    const attachments = [
      {
        id: "att-1",
        name: "image.png",
        type: "image/png",
        previewUrl: "blob://preview",
        file: "/tmp/image.png", // use string path to avoid File in Node
      },
    ];

    await playlistStore.saveAttachments(vid, pid, attachments as any);

    const stored = await db.attachments
      .where("[versionId+playlistId]")
      .equals([vid, pid])
      .toArray();
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe("image.png");
    expect(stored[0].type).toBe("image/png");
    expect(stored[0].filePath).toBe("/tmp/image.png");

    const versionEntity = await repo.getVersion(pid, vid);
    expect(versionEntity?.attachments?.length || 0).toBe(1);
    expect(versionEntity?.attachments?.[0].name).toBe("image.png");
    expect((versionEntity as any).attachments?.[0].data).toBeUndefined();
  });

  it("clears attachments for a version", async () => {
    const pid = "plist-attach-clear";
    const vid = "v1";
    await seedPlaylistWithVersion(pid, vid);

    await db.attachments.put({
      id: "a",
      noteId: "",
      versionId: vid,
      playlistId: pid,
      name: "tmp",
      type: "text/plain",
      size: 0,
      previewUrl: "",
      createdAt: Date.now(),
    });
    await repo.updateVersion(pid, vid, { attachments: [{ id: "a" } as any] });

    await playlistStore.clearAttachments(vid, pid);

    const remaining = await db.attachments
      .where("[versionId+playlistId]")
      .equals([vid, pid])
      .count();
    expect(remaining).toBe(0);

    const versionEntity = await repo.getVersion(pid, vid);
    expect(versionEntity?.attachments?.length || 0).toBe(0);
  });
});
