/**
 * @fileoverview DraftManager.ts
 * Handles draft note operations and content management.
 * Manages note status and content persistence tied to stable playlist UUIDs.
 */

import { ftrackNoteService } from "@/services/ftrack/FtrackNoteService";
import { PlaylistRepository } from "./PlaylistRepository";
import { DraftOperations } from "./types";

export class DraftManager implements DraftOperations {
  constructor(private repository: PlaylistRepository) {
    console.log("[DraftManager] Initialized");
  }

  // =================== DRAFT OPERATIONS ===================

  /**
   * Saves draft content for a version in a playlist
   */
  async saveDraft(
    playlistId: string,
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<void> {
    const trimmedContent = content.trim();
    const newStatus = trimmedContent ? "draft" : "empty";

    console.log(
      `[DraftManager] Saving draft for version ${versionId} in playlist ${playlistId}`,
      {
        contentLength: trimmedContent.length,
        status: newStatus,
        hasLabel: !!labelId,
      },
    );

    await this.repository.updateVersion(playlistId, versionId, {
      draftContent: trimmedContent || undefined, // Store undefined for empty content
      labelId,
      noteStatus: newStatus,
      lastModified: Date.now(),
    });

    console.log(`[DraftManager] Successfully saved draft for ${versionId}`);
  }

  /**
   * Gets draft content for a version
   */
  async getDraftContent(
    playlistId: string,
    versionId: string,
  ): Promise<string | null> {
    const versions = await this.repository.getPlaylistVersions(playlistId);
    const version = versions.find((v) => v.id === versionId);

    const content = version?.draftContent || null;
    console.log(`[DraftManager] Retrieved draft content for ${versionId}:`, {
      found: !!version,
      hasContent: !!content,
      length: content?.length || 0,
    });

    return content;
  }

  /**
   * Clears draft content for a version
   */
  async clearDraft(playlistId: string, versionId: string): Promise<void> {
    console.log(
      `[DraftManager] Clearing draft for version ${versionId} in playlist ${playlistId}`,
    );

    await this.repository.updateVersion(playlistId, versionId, {
      draftContent: undefined,
      labelId: undefined,
      noteStatus: "empty",
      lastModified: Date.now(),
    });

    console.log(`[DraftManager] Successfully cleared draft for ${versionId}`);
  }

  /**
   * Publishes a note (marks it as published)
   */
  async publishNote(playlistId: string, versionId: string): Promise<void> {
    console.log(
      `[DraftManager] Publishing note for version ${versionId} in playlist ${playlistId}`,
    );

    // 1. Get the current version data from the repository
    const version = await this.repository.getVersion(playlistId, versionId);
    if (!version || !version.draftContent) {
      throw new Error(
        `Draft for version ${versionId} in playlist ${playlistId} not found or is empty.`,
      );
    }

    // 2. Get attachments for the version
    const attachments = await this.repository.getAttachmentsForVersion(
      playlistId,
      versionId,
    );

    // 3. Call the ftrack API to publish the note
    await ftrackNoteService.publishNoteWithAttachmentsAPI(
      versionId,
      version.draftContent,
      attachments,
      version.labelId,
    );

    // 4. Update the local status to "published"
    await this.repository.updateVersion(playlistId, versionId, {
      noteStatus: "published",
      lastModified: Date.now(),
    });

    console.log(`[DraftManager] Successfully published note for ${versionId}`);
  }

  // =================== BATCH OPERATIONS ===================

  /**
   * Gets all drafts for a playlist
   */
  async getPlaylistDrafts(playlistId: string): Promise<
    Array<{
      versionId: string;
      content: string;
      labelId?: string;
      lastModified: number;
    }>
  > {
    const versions = await this.repository.getPlaylistVersions(playlistId);

    const drafts = versions
      .filter((v) => v.draftContent && v.draftContent.trim())
      .map((v) => ({
        versionId: v.id,
        content: v.draftContent!,
        labelId: v.labelId,
        lastModified: v.lastModified,
      }));

    console.log(
      `[DraftManager] Found ${drafts.length} drafts in playlist ${playlistId}`,
    );
    return drafts;
  }

  /**
   * Clears all drafts in a playlist
   */
  async clearAllDrafts(playlistId: string): Promise<number> {
    console.log(`[DraftManager] Clearing all drafts in playlist ${playlistId}`);

    const versions = await this.repository.getPlaylistVersions(playlistId);
    const draftsToClr = versions.filter(
      (v) => v.draftContent && v.draftContent.trim(),
    );

    for (const version of draftsToClr) {
      await this.repository.updateVersion(playlistId, version.id, {
        draftContent: undefined,
        labelId: undefined,
        noteStatus: "empty",
        lastModified: Date.now(),
      });
    }

    console.log(
      `[DraftManager] Cleared ${draftsToClr.length} drafts in playlist ${playlistId}`,
    );
    return draftsToClr.length;
  }

  /**
   * Publishes all drafts in a playlist
   */
  async publishAllDrafts(playlistId: string): Promise<number> {
    console.log(
      `[DraftManager] Publishing all drafts in playlist ${playlistId}`,
    );

    const versions = await this.repository.getPlaylistVersions(playlistId);
    const draftsToPublish = versions.filter(
      (v) =>
        v.noteStatus === "draft" && v.draftContent && v.draftContent.trim(),
    );

    for (const version of draftsToPublish) {
      await this.repository.updateVersion(playlistId, version.id, {
        noteStatus: "published",
        lastModified: Date.now(),
      });
    }

    console.log(
      `[DraftManager] Published ${draftsToPublish.length} drafts in playlist ${playlistId}`,
    );
    return draftsToPublish.length;
  }

  // =================== UTILITY METHODS ===================

  /**
   * Gets draft statistics for a playlist
   */
  async getDraftStats(playlistId: string): Promise<{
    totalVersions: number;
    emptyNotes: number;
    draftNotes: number;
    publishedNotes: number;
    reviewedNotes: number;
  }> {
    const versions = await this.repository.getPlaylistVersions(playlistId);

    const stats = {
      totalVersions: versions.length,
      emptyNotes: versions.filter((v) => v.noteStatus === "empty").length,
      draftNotes: versions.filter((v) => v.noteStatus === "draft").length,
      publishedNotes: versions.filter((v) => v.noteStatus === "published")
        .length,
      reviewedNotes: versions.filter((v) => v.noteStatus === "reviewed").length,
    };

    console.log(
      `[DraftManager] Draft stats for playlist ${playlistId}:`,
      stats,
    );
    return stats;
  }

  /**
   * Searches for content in drafts
   */
  async searchDrafts(
    playlistId: string,
    searchTerm: string,
  ): Promise<
    Array<{
      versionId: string;
      versionName: string;
      content: string;
      matchStart: number;
      matchEnd: number;
    }>
  > {
    const versions = await this.repository.getPlaylistVersions(playlistId);
    const searchLower = searchTerm.toLowerCase();
    const results = [];

    for (const version of versions) {
      if (version.draftContent) {
        const contentLower = version.draftContent.toLowerCase();
        const matchIndex = contentLower.indexOf(searchLower);

        if (matchIndex !== -1) {
          results.push({
            versionId: version.id,
            versionName: version.name,
            content: version.draftContent,
            matchStart: matchIndex,
            matchEnd: matchIndex + searchTerm.length,
          });
        }
      }
    }

    console.log(
      `[DraftManager] Found ${results.length} draft matches for "${searchTerm}" in playlist ${playlistId}`,
    );
    return results;
  }
}
