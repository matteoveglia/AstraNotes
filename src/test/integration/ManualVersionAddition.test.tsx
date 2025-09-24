/**
 * @fileoverview ManualVersionAddition.test.tsx
 * Integration tests for manual version addition behavior using the modular playlist store
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { playlistStore } from "@/store/playlist";
import { db } from "@/store/db";
import type { AssetVersion, CreatePlaylistRequest } from "@/types";

async function seedPlaylist(overrides: Partial<CreatePlaylistRequest> = {}) {
  const baseRequest: CreatePlaylistRequest = {
    name: "Manual Addition Test Playlist",
    type: "list",
    projectId: "test-project",
    description: "Manual addition integration test",
    ...overrides,
  };

  return await playlistStore.createPlaylist(baseRequest);
}

describe("Manual Version Addition Integration", () => {
  beforeEach(async () => {
    await db.playlists.clear();
    await db.versions.clear();
    playlistStore.clearCache();
  });

  afterEach(async () => {
    playlistStore.removeAllListeners();
    await db.playlists.clear();
    await db.versions.clear();
    playlistStore.clearCache();
  });

  it("persists manually added versions via addVersionToPlaylist alias", async () => {
    const playlist = await seedPlaylist();

    const manualVersion: AssetVersion = {
      id: "manual-version-1",
      name: "Manual Test Version",
      version: 1,
      manuallyAdded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await playlistStore.addVersionToPlaylist(playlist.id, manualVersion);

    const storedPlaylist = await playlistStore.getPlaylist(playlist.id);
    expect(storedPlaylist).toBeTruthy();
    if (!storedPlaylist) throw new Error("Expected playlist to be defined");

    const versions = storedPlaylist.versions ?? [];
    expect(versions).toHaveLength(1);

    const storedVersion = versions[0];
    expect(storedVersion).toBeDefined();
    expect(storedVersion?.id).toBe(manualVersion.id);
    expect(storedVersion?.manuallyAdded).toBe(true);

    const storedVersionRecord = await db.versions.get([
      playlist.id,
      manualVersion.id,
    ]);
    expect(storedVersionRecord).toBeTruthy();
    expect(storedVersionRecord?.manuallyAdded).toBe(true);
    expect(storedVersionRecord?.isRemoved).toBe(false);
  });

  it("exposes manual addition API surface on playlistStore", () => {
    expect(typeof playlistStore.addVersionToPlaylist).toBe("function");
    expect(typeof playlistStore.addVersionsToPlaylist).toBe("function");
    expect(typeof playlistStore.removeVersionFromPlaylist).toBe("function");
  });

  it("emits versions-added events containing manual additions", async () => {
    const playlist = await seedPlaylist({ name: "Event Emission Playlist" });

    const listener = vi.fn();
    playlistStore.on("versions-added", listener);

    const manualVersion: AssetVersion = {
      id: "manual-version-event",
      name: "Manual Event Version",
      version: 2,
      manuallyAdded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await playlistStore.addVersionToPlaylist(playlist.id, manualVersion);

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.playlistId).toBe(playlist.id);
    expect(payload.versions).toHaveLength(1);
    expect(payload.versions[0].id).toBe(manualVersion.id);
    expect(payload.versions[0].manuallyAdded).toBe(true);

    playlistStore.off("versions-added", listener);
  });
});
