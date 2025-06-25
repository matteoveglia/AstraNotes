/**
 * @fileoverview PlaylistRepository.ts
 * Pure database operations for playlists and versions.
 * No caching, no business logic - just CRUD operations using stable UUIDs.
 */

import { db, PlaylistRecord, VersionRecord } from "../db";
import { PlaylistEntity, VersionEntity, PlaylistOperations } from "./types";

export class PlaylistRepository implements PlaylistOperations {
  // =================== PLAYLIST CRUD ===================

  async createPlaylist(entity: PlaylistEntity): Promise<void> {
    const record: PlaylistRecord = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      localStatus: entity.localStatus,
      ftrackSyncStatus: entity.ftrackSyncStatus,
      ftrackStatus: entity.ftrackStatus,
      ftrackId: entity.ftrackId,
      projectId: entity.projectId,
      categoryId: entity.categoryId,
      categoryName: entity.categoryName,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      syncedAt: entity.syncedAt,
      lastChecked: entity.lastChecked,
    };

    await db.playlists.add(record);
    console.log(`[PlaylistRepository] Created playlist: ${entity.id}`);
  }

  async getPlaylist(id: string): Promise<PlaylistEntity | null> {
    const record = await db.playlists.get(id);
    if (!record) return null;

    return this.recordToEntity(record);
  }

  async updatePlaylist(
    id: string,
    updates: Partial<PlaylistEntity>,
  ): Promise<void> {
    const updateRecord: Partial<PlaylistRecord> = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    console.log(
      `[PlaylistRepository] About to update playlist ${id} with record:`,
      updateRecord,
    );
    console.log(`[PlaylistRepository] ftrackId in updates:`, updates.ftrackId);
    console.log(
      `[PlaylistRepository] ftrackId in updateRecord:`,
      updateRecord.ftrackId,
    );

    const updated = await db.playlists.update(id, updateRecord);
    if (updated === 0) {
      throw new Error(`Playlist ${id} not found for update`);
    }

    console.log(`[PlaylistRepository] Updated playlist: ${id}`, updates);

    // Verify the update worked by reading back the record
    const verifyRecord = await db.playlists.get(id);
    console.log(`[PlaylistRepository] Verification - playlist after update:`, {
      id: verifyRecord?.id,
      ftrackId: verifyRecord?.ftrackId,
      ftrackSyncStatus: verifyRecord?.ftrackSyncStatus,
      localStatus: verifyRecord?.localStatus,
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    await db.transaction("rw", [db.playlists, db.versions], async () => {
      // Delete playlist and all associated versions
      await db.playlists.delete(id);
      await db.versions.where("playlistId").equals(id).delete();
    });

    console.log(`[PlaylistRepository] Deleted playlist: ${id}`);
  }

  async getPlaylistsByProject(projectId: string): Promise<PlaylistEntity[]> {
    const records = await db.playlists
      .where("projectId")
      .equals(projectId)
      .toArray();

    return records.map((record) => this.recordToEntity(record));
  }

  async findByNameAndProject(
    name: string,
    projectId: string,
  ): Promise<PlaylistEntity | null> {
    const record = await db.playlists
      .where("projectId")
      .equals(projectId)
      .and((playlist) => playlist.name === name)
      .first();

    if (!record) return null;
    return this.recordToEntity(record);
  }

  async findByNameProjectAndType(
    name: string,
    projectId: string,
    type: "reviewsession" | "list",
  ): Promise<PlaylistEntity | null> {
    const record = await db.playlists
      .where("projectId")
      .equals(projectId)
      .and((playlist) => playlist.name === name && playlist.type === type)
      .first();

    if (!record) return null;
    return this.recordToEntity(record);
  }

  async updatePlaylistName(
    id: string,
    newName: string,
  ): Promise<PlaylistEntity> {
    const updated = await db.playlists.update(id, {
      name: newName,
      updatedAt: new Date().toISOString(),
    });

    if (updated === 0) {
      throw new Error(`Playlist ${id} not found for name update`);
    }

    const playlist = await this.getPlaylist(id);
    if (!playlist) {
      throw new Error(`Playlist ${id} not found after name update`);
    }

    console.debug(
      `[PlaylistRepository] Updated playlist name: ${id} -> "${newName}"`,
    );
    return playlist;
  }

  // =================== VERSION OPERATIONS ===================

  async getPlaylistVersions(playlistId: string): Promise<VersionEntity[]> {
    const records = await db.versions
      .where("playlistId")
      .equals(playlistId)
      .and((v) => !v.isRemoved)
      .toArray();

    return records.map((record) => this.versionRecordToEntity(record));
  }

  async addVersionToPlaylist(
    playlistId: string,
    version: VersionEntity,
  ): Promise<void> {
    const record: VersionRecord = this.versionEntityToRecord(version);
    await db.versions.add(record);

    console.log(
      `[PlaylistRepository] Added version ${version.id} to playlist ${playlistId}`,
    );
  }

  async updateVersion(
    playlistId: string,
    versionId: string,
    updates: Partial<VersionEntity>,
  ): Promise<void> {
    const updateRecord: Partial<VersionRecord> = {
      ...updates,
      lastModified: Date.now(),
    };

    const updated = await db.versions.update(
      [playlistId, versionId],
      updateRecord,
    );
    if (updated === 0) {
      throw new Error(
        `Version ${versionId} not found in playlist ${playlistId}`,
      );
    }

    console.log(
      `[PlaylistRepository] Updated version ${versionId} in playlist ${playlistId}`,
      updates,
    );
  }

  async removeVersionFromPlaylist(
    playlistId: string,
    versionId: string,
  ): Promise<void> {
    await this.updateVersion(playlistId, versionId, { isRemoved: true });
  }

  // =================== BULK OPERATIONS ===================

  async bulkUpdateVersions(
    playlistId: string,
    updates: Partial<VersionEntity>,
  ): Promise<void> {
    const updateRecord: Partial<VersionRecord> = {
      ...updates,
      lastModified: Date.now(),
    };

    await db.versions
      .where("playlistId")
      .equals(playlistId)
      .modify(updateRecord);

    console.log(
      `[PlaylistRepository] Bulk updated versions for playlist ${playlistId}`,
      updates,
    );
  }

  async bulkAddVersions(
    playlistId: string,
    versions: VersionEntity[],
  ): Promise<void> {
    const records = versions.map((version) =>
      this.versionEntityToRecord(version),
    );

    // CRITICAL FIX: Use bulkPut() instead of bulkAdd() to handle existing versions
    // This prevents ConstraintError when versions already exist
    await db.versions.bulkPut(records);

    console.log(
      `[PlaylistRepository] Bulk added/updated ${versions.length} versions to playlist ${playlistId}`,
    );
  }

  // =================== UTILITY METHODS ===================

  async getPlaylistCount(): Promise<number> {
    return await db.playlists.count();
  }

  async getVersionCount(playlistId?: string): Promise<number> {
    if (playlistId) {
      return await db.versions
        .where("playlistId")
        .equals(playlistId)
        .and((v) => !v.isRemoved)
        .count();
    }

    return await db.versions.filter((v) => !v.isRemoved).count();
  }

  // =================== CONVERSION METHODS ===================

  private recordToEntity(record: PlaylistRecord): PlaylistEntity {
    return {
      id: record.id,
      name: record.name,
      type: record.type || "list", // Default to list if not specified
      localStatus: record.localStatus || "draft",
      ftrackSyncStatus: record.ftrackSyncStatus || "not_synced",
      ftrackStatus: record.ftrackStatus,
      ftrackId: record.ftrackId,
      projectId: record.projectId || "", // Required field, fallback to empty
      categoryId: record.categoryId,
      categoryName: record.categoryName,
      description: record.description,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      syncedAt: record.syncedAt,
      lastChecked: record.lastChecked,
    };
  }

  private versionRecordToEntity(record: VersionRecord): VersionEntity {
    return {
      id: record.id,
      playlistId: record.playlistId,
      name: record.name,
      version: record.version,
      thumbnailUrl: record.thumbnailUrl,
      thumbnailId: record.thumbnailId,
      reviewSessionObjectId: record.reviewSessionObjectId,
      draftContent: record.draftContent,
      labelId: record.labelId,
      noteStatus: record.noteStatus || "empty",
      addedAt: record.addedAt || new Date().toISOString(),
      lastModified: record.lastModified || Date.now(),
      manuallyAdded: record.manuallyAdded || false,
      isRemoved: record.isRemoved,
      // Legacy compatibility
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      syncedAt: record.syncedAt,
      attachments: record.attachments,
    };
  }

  private versionEntityToRecord(entity: VersionEntity): VersionRecord {
    return {
      id: entity.id,
      playlistId: entity.playlistId,
      name: entity.name,
      version: entity.version,
      thumbnailUrl: entity.thumbnailUrl,
      thumbnailId: entity.thumbnailId,
      reviewSessionObjectId: entity.reviewSessionObjectId,
      draftContent: entity.draftContent,
      labelId: entity.labelId || "", // Convert undefined to empty string for DB compatibility
      noteStatus: entity.noteStatus,
      addedAt: entity.addedAt,
      lastModified: entity.lastModified,
      manuallyAdded: entity.manuallyAdded,
      isRemoved: entity.isRemoved,
      // Legacy compatibility
      createdAt: entity.createdAt || new Date().toISOString(), // Provide default if undefined
      updatedAt: entity.updatedAt || new Date().toISOString(), // Provide default if undefined
      syncedAt: entity.syncedAt,
      attachments: entity.attachments,
      // Legacy fields for backward compatibility
      isLocalPlaylist: false,
      localPlaylistAddedAt: entity.addedAt,
    };
  }
}
