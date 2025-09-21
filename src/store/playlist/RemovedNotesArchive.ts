/**
 * @fileoverview RemovedNotesArchive.ts
 * Archives draft notes and labels for versions removed from a playlist.
 * Uses stable playlist UUIDs (NOT ftrack IDs) and a 7-day TTL by default.
 */

import { db, type RemovedNoteArchiveRecord } from "../db";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class RemovedNotesArchive {
  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  async save(
    playlistId: string,
    versionId: string,
    content: string,
    labelId?: string,
    archivedAt: number = Date.now(),
  ): Promise<void> {
    const record: RemovedNoteArchiveRecord = {
      playlistId,
      versionId,
      content,
      labelId,
      archivedAt,
    };

    await db.removedNotesArchive.put(record);
    console.debug(
      `[RemovedNotesArchive] Archived note for ${versionId} in playlist ${playlistId}`,
    );
  }

  async get(
    playlistId: string,
    versionId: string,
  ): Promise<RemovedNoteArchiveRecord | undefined> {
    const rec = await db.removedNotesArchive.get([playlistId, versionId]);
    return rec || undefined;
  }

  async delete(playlistId: string, versionId: string): Promise<void> {
    await db.removedNotesArchive.delete([playlistId, versionId]);
  }

  isExpired(archivedAt: number): boolean {
    return Date.now() - archivedAt > this.ttlMs;
  }

  async purgeExpired(): Promise<number> {
    const now = Date.now();
    const all = await db.removedNotesArchive.toArray();
    const expired = all.filter((r) => now - r.archivedAt > this.ttlMs);
    if (expired.length > 0) {
      await db.removedNotesArchive.bulkDelete(
        expired.map((r) => [r.playlistId, r.versionId] as [string, string]),
      );
    }
    return expired.length;
  }

  async listAll(): Promise<RemovedNoteArchiveRecord[]> {
    return await db.removedNotesArchive.toArray();
  }

  async listExpired(): Promise<RemovedNoteArchiveRecord[]> {
    const now = Date.now();
    const all = await this.listAll();
    return all.filter((r) => now - r.archivedAt > this.ttlMs);
  }
}
