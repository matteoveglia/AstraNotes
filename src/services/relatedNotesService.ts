/**
 * @fileoverview relatedNotesService.ts
 * Service for handling related notes functionality.
 * Fetches and processes notes for versions from the same shot.
 */

import { Session } from "@ftrack/api";
import { BaseFtrackClient } from "./ftrack/BaseFtrackClient";
import {
  ShotNote,
  NoteLabel,
  NoteAttachment,
  RawNoteData,
  RawUserData,
  RawVersionData,
  RawLabelLinkData,
  RawAttachmentData,
  ShotNotesCache,
  NotesLoadingProgress,
  NotesLoadingError,
} from "@/types/relatedNotes";

export class RelatedNotesService extends BaseFtrackClient {
  private cache: Map<string, ShotNotesCache> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_ENTRIES = 50;

  /**
   * Extract shot name from version name (reused from RelatedVersionsService)
   * Examples:
   * - "ASE0110_comp_000000_GMK" -> "ASE0110"
   * - "SQ010_SH020_layout_v001" -> "SQ010_SH020"
   * - "shot_010_lighting_v003" -> "shot_010"
   */
  extractShotName(versionName: string): string {
    console.debug(
      "[RelatedNotesService] Extracting shot name from:",
      versionName,
    );

    const parts = versionName.split("_");

    if (parts.length === 0) {
      console.debug(
        "[RelatedNotesService] No underscores found, returning full name",
      );
      return versionName;
    }

    const firstPart = parts[0];
    const secondPart = parts[1];

    // Pattern: SQ###_SH### (sequence and shot)
    if (firstPart.match(/^SQ\d+$/i) && secondPart?.match(/^SH\d+$/i)) {
      const shotName = `${firstPart}_${secondPart}`;
      console.debug(
        "[RelatedNotesService] Detected SQ_SH pattern:",
        shotName,
      );
      return shotName;
    }

    // Pattern: shot_###
    if (firstPart.toLowerCase() === "shot" && secondPart?.match(/^\d+$/)) {
      const shotName = `${firstPart}_${secondPart}`;
      console.debug(
        "[RelatedNotesService] Detected shot_number pattern:",
        shotName,
      );
      return shotName;
    }

    // Pattern: ASE###, sequence codes, etc. (single part shot codes)
    if (firstPart.match(/^[A-Z]{2,4}\d+$/i)) {
      console.debug(
        "[RelatedNotesService] Detected shot code pattern:",
        firstPart,
      );
      return firstPart;
    }

    // Default: use first part
    console.debug(
      "[RelatedNotesService] Using default first part:",
      firstPart,
    );
    return firstPart;
  }

  /**
   * Diagnostic: Check what attributes are available on Note entity
   */
  private async diagnoseNoteSchema(session: Session): Promise<void> {
    try {
      console.debug("[RelatedNotesService] Diagnosing Note schema...");
      
      // Try to get a single note to see available attributes
      const result = await session.query("select * from Note limit 1");
      if (result?.data?.length > 0) {
        const note = result.data[0];
        console.debug("[RelatedNotesService] Available Note attributes:", Object.keys(note));
        console.debug("[RelatedNotesService] Sample Note data:", note);
      } else {
        console.debug("[RelatedNotesService] No notes found for schema diagnosis");
      }
    } catch (error) {
      console.error("[RelatedNotesService] Failed to diagnose Note schema:", error);
    }
  }

  /**
   * Alternative approach: Use ReviewSessionObject to find notes
   * This leverages the existing playlist/review session infrastructure
   */
  private async fetchNotesViaReviewSessions(
    session: Session,
    shotName: string,
  ): Promise<RawNoteData[]> {
    try {
      console.debug("[RelatedNotesService] Trying ReviewSessionObject approach for shot:", shotName);
      
      // First, let's try the approach from the archived code that works
      const query = `
        select 
          id,
          content,
          date,
          user_id,
          parent_id,
          parent_type
        from Note 
        where parent_id in (
          select entity_id from ReviewSessionObject 
          where review_session_object.entity_type is "AssetVersion"
          and review_session_object.entity_id in (
            select id from AssetVersion where asset.name like "${shotName}%"
          )
        )
        order by date desc
      `;

      const result = await session.query(query);
      const rawNotes = (result?.data || []).map((item: any) => ({
        id: item.id,
        content: item.content,
        created_date: item.date,
        user_id: item.user_id,
        parent_id: item.parent_id,
        parent_type: item.parent_type || "AssetVersion",
      }));

      console.debug(
        `[RelatedNotesService] Found ${rawNotes.length} notes via ReviewSessionObject approach`,
      );
      return rawNotes;
    } catch (error) {
      console.error("[RelatedNotesService] ReviewSessionObject approach failed:", error);
      throw error;
    }
  }

  /**
   * Fallback approach: Use the exact pattern from archived ftrack code
   */
  private async fetchNotesViaArchivedPattern(
    session: Session,
    shotName: string,
  ): Promise<RawNoteData[]> {
    try {
      console.debug("[RelatedNotesService] Trying archived pattern approach for shot:", shotName);
      
      // Use the exact query pattern that worked in the archived code
      const query = `
        select 
          id,
          content,
          date,
          user_id,
          parent_id
        from Note 
        where parent_id in (
          select id from AssetVersion where asset.name like "${shotName}%"
        )
        order by date desc
      `;

      const result = await session.query(query);
      const rawNotes = (result?.data || []).map((item: any) => ({
        id: item.id,
        content: item.content,
        created_date: item.date,
        user_id: item.user_id,
        parent_id: item.parent_id,
        parent_type: "AssetVersion",
      }));

      console.debug(
        `[RelatedNotesService] Found ${rawNotes.length} notes via archived pattern`,
      );
      return rawNotes;
    } catch (error) {
      console.error("[RelatedNotesService] Archived pattern approach failed:", error);
      throw error;
    }
  }

  /**
   * Fetch raw notes by shot name using multiple fallback strategies
   */
  private async fetchRawNotesByShotName(
    session: Session,
    shotName: string,
  ): Promise<RawNoteData[]> {
    // First, diagnose the schema to understand what's available
    await this.diagnoseNoteSchema(session);

    // Try multiple approaches in order of preference
    const approaches = [
      () => this.fetchNotesViaArchivedPattern(session, shotName),
      () => this.fetchNotesViaReviewSessions(session, shotName),
    ];

    for (let i = 0; i < approaches.length; i++) {
      try {
        console.debug(`[RelatedNotesService] Trying approach ${i + 1}/${approaches.length}`);
        const result = await approaches[i]();
        if (result.length > 0) {
          console.debug(`[RelatedNotesService] Approach ${i + 1} succeeded with ${result.length} notes`);
          return result;
        }
        console.debug(`[RelatedNotesService] Approach ${i + 1} returned 0 notes, trying next...`);
      } catch (error) {
        console.debug(`[RelatedNotesService] Approach ${i + 1} failed:`, error);
        if (i === approaches.length - 1) {
          // Last approach failed, re-throw the error
          throw error;
        }
      }
    }

    console.debug("[RelatedNotesService] All approaches returned 0 notes");
    return [];
  }

  /**
   * Fetch all notes for versions from the same shot
   */
  async fetchNotesByShotName(shotName: string): Promise<ShotNote[]> {
    console.debug(
      "[RelatedNotesService] Fetching notes for shot:",
      shotName,
    );

    // Check cache first
    const cached = this.getCachedNotes(shotName);
    if (cached) {
      console.debug(
        "[RelatedNotesService] Returning cached notes for shot:",
        shotName,
      );
      return cached;
    }

    try {
      const session = await this.getSession();
      
      // Step 1: Get all asset versions for this shot
      const versionIds = await this.fetchVersionIdsByShotName(session, shotName);
      
      if (versionIds.length === 0) {
        console.debug(
          "[RelatedNotesService] No versions found for shot:",
          shotName,
        );
        return [];
      }

      // Step 2: Get all notes for these versions using a subquery on AssetVersion by shot name
      // This avoids issues with server-specific schema differences and large IN lists
      const rawNotes = await this.fetchRawNotesByShotName(session, shotName);
      
      if (rawNotes.length === 0) {
        console.debug(
          "[RelatedNotesService] No notes found for shot:",
          shotName,
        );
        return [];
      }

      // Step 3: Process notes with all related data
      const processedNotes = await this.processRawNotes(session, rawNotes);

      // Cache the results
      this.cacheNotes(shotName, processedNotes);

      console.debug(
        `[RelatedNotesService] Found ${processedNotes.length} notes for shot ${shotName}`,
      );
      return processedNotes;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch notes for shot:",
        shotName,
        error,
      );
      throw this.createNotesError('api', `Failed to fetch notes for shot ${shotName}`, error);
    }
  }

  /**
   * Get version IDs for all versions in a shot
   */
  private async fetchVersionIdsByShotName(
    session: Session,
    shotName: string,
  ): Promise<string[]> {
    try {
      // Query for asset versions where the asset name starts with the shot name
      const query = `
        select id from AssetVersion 
        where asset.name like "${shotName}%"
      `;
      
      const result = await session.query(query);
      const versionIds = (result?.data || []).map((item: any) => item.id);
      
      console.debug(
        `[RelatedNotesService] Found ${versionIds.length} versions for shot ${shotName}`,
      );
      return versionIds;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch version IDs for shot:",
        shotName,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch raw note data from ftrack
   */
  private async fetchRawNotes(
    session: Session,
    versionIds: string[],
  ): Promise<RawNoteData[]> {
    try {
      const versionIdList = versionIds.map(id => `"${id}"`).join(', ');
      const query = `
        select id, content, created_at, created_by_id, parent_id
        from Note
        where parent_id in (${versionIdList})
        order by created_at desc
      `;
      
      const result = await session.query(query);
      const rawNotes = (result?.data || []).map((item: any) => ({
        id: item.id,
        content: item.content,
        // Support multiple shapes: 'created_at' (preferred), then 'date', then legacy 'created_date' (tests)
        created_date: item.created_at ?? item.date ?? item.created_date,
        // Use flat fields
        user_id: item.user_id ?? item.created_by_id,
        parent_id: item.parent_id,
        parent_type: "AssetVersion",
      }));
      
      console.debug(
        `[RelatedNotesService] Found ${rawNotes.length} raw notes`,
      );
      return rawNotes;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch raw notes:",
        error,
      );
      throw error;
    }
  }

  /**
   * Process raw notes into full ShotNote objects
   */
  private async processRawNotes(
    session: Session,
    rawNotes: RawNoteData[],
  ): Promise<ShotNote[]> {
    if (rawNotes.length === 0) return [];

    try {
      // Extract unique IDs for batch fetching
      const userIds = [...new Set(rawNotes.map(note => note.user_id))];
      const versionIds = [...new Set(rawNotes.map(note => note.parent_id))];
      const noteIds = rawNotes.map(note => note.id);

      // Batch fetch all related data
      const [users, versions, labels, attachments] = await Promise.all([
        this.batchFetchUserInfo(session, userIds),
        this.batchFetchVersionInfo(session, versionIds),
        this.batchFetchNoteLabels(session, noteIds),
        this.batchFetchNoteAttachments(session, noteIds),
      ]);

      // Process each note
      const processedNotes: ShotNote[] = rawNotes.map(rawNote => {
        const user = users[rawNote.user_id] || {
          id: rawNote.user_id,
          username: 'Unknown User',
        };
        
        const version = versions[rawNote.parent_id] || {
          id: rawNote.parent_id,
          name: 'Unknown Version',
          version: 0,
        };

        return {
          id: rawNote.id,
          content: rawNote.content,
          createdAt: rawNote.created_date,
          updatedAt: rawNote.created_date, // ftrack doesn't track note updates separately
          user,
          version,
          labels: labels[rawNote.id] || [],
          attachments: attachments[rawNote.id] || [],
        };
      });

      return processedNotes;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to process raw notes:",
        error,
      );
      throw error;
    }
  }

  /**
   * Batch fetch user information
   */
  private async batchFetchUserInfo(
    session: Session,
    userIds: string[],
  ): Promise<Record<string, any>> {
    if (userIds.length === 0) return {};

    try {
      const userIdList = userIds.map(id => `"${id}"`).join(', ');
      const query = `
        select id, username, first_name, last_name 
        from User 
        where id in (${userIdList})
      `;
      
      const result = await session.query(query);
      const users: Record<string, any> = {};
      
      (result?.data || []).forEach((user: any) => {
        users[user.id] = {
          id: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        };
      });
      
      console.debug(
        `[RelatedNotesService] Fetched ${Object.keys(users).length} users`,
      );
      return users;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch user info:",
        error,
      );
      return {};
    }
  }

  /**
   * Batch fetch version information
   */
  private async batchFetchVersionInfo(
    session: Session,
    versionIds: string[],
  ): Promise<Record<string, any>> {
    if (versionIds.length === 0) return {};

    try {
      const versionIdList = versionIds.map(id => `"${id}"`).join(', ');
      const query = `
        select id, version, asset.name, thumbnail.id 
        from AssetVersion 
        join Asset on AssetVersion.asset_id = Asset.id
        left join Component as thumbnail on AssetVersion.thumbnail_id = thumbnail.id
        where AssetVersion.id in (${versionIdList})
      `;
      
      const result = await session.query(query);
      const versions: Record<string, any> = {};
      
      (result?.data || []).forEach((version: any) => {
        versions[version.id] = {
          id: version.id,
          name: version.asset.name,
          version: version.version,
          thumbnailId: version.thumbnail?.id,
        };
      });
      
      console.debug(
        `[RelatedNotesService] Fetched ${Object.keys(versions).length} versions`,
      );
      return versions;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch version info:",
        error,
      );
      return {};
    }
  }

  /**
   * Batch fetch note labels
   */
  private async batchFetchNoteLabels(
    session: Session,
    noteIds: string[],
  ): Promise<Record<string, NoteLabel[]>> {
    if (noteIds.length === 0) return {};

    try {
      const noteIdList = noteIds.map(id => `"${id}"`).join(', ');
      const query = `
        select note_id, label.id, label.name, label.color
        from NoteLabelLink
        join NoteLabel as label on NoteLabelLink.label_id = label.id
        where note_id in (${noteIdList})
      `;
      
      const result = await session.query(query);
      const labels: Record<string, NoteLabel[]> = {};
      
      (result?.data || []).forEach((item: any) => {
        if (!labels[item.note_id]) {
          labels[item.note_id] = [];
        }
        labels[item.note_id].push({
          id: item.label.id,
          name: item.label.name,
          color: item.label.color,
        });
      });
      
      console.debug(
        `[RelatedNotesService] Fetched labels for ${Object.keys(labels).length} notes`,
      );
      return labels;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch note labels:",
        error,
      );
      return {};
    }
  }

  /**
   * Batch fetch note attachments
   */
  private async batchFetchNoteAttachments(
    session: Session,
    noteIds: string[],
  ): Promise<Record<string, NoteAttachment[]>> {
    if (noteIds.length === 0) return {};

    try {
      const noteIdList = noteIds.map(id => `"${id}"`).join(', ');
      const query = `
        select note_id, component.id, component.name, component.file_type, component.size
        from NoteComponent
        join Component on NoteComponent.component_id = Component.id  
        where note_id in (${noteIdList})
      `;
      
      const result = await session.query(query);
      const attachments: Record<string, NoteAttachment[]> = {};
      
      (result?.data || []).forEach((item: any) => {
        if (!attachments[item.note_id]) {
          attachments[item.note_id] = [];
        }
        attachments[item.note_id].push({
          id: item.component.id,
          name: item.component.name,
          type: item.component.file_type,
          size: item.component.size,
        });
      });
      
      console.debug(
        `[RelatedNotesService] Fetched attachments for ${Object.keys(attachments).length} notes`,
      );
      return attachments;
    } catch (error) {
      console.error(
        "[RelatedNotesService] Failed to fetch note attachments:",
        error,
      );
      return {};
    }
  }

  /**
   * Cache management
   */
  private getCachedNotes(shotName: string): ShotNote[] | null {
    const cached = this.cache.get(shotName);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(shotName);
      return null;
    }
    
    return cached.notes;
  }

  private cacheNotes(shotName: string, notes: ShotNote[]): void {
    // Clean up old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(shotName, {
      shotName,
      notes,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL,
    });
  }

  /**
   * Clear cache for a specific shot or all shots
   */
  clearCache(shotName?: string): void {
    if (shotName) {
      this.cache.delete(shotName);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Create standardized error objects
   */
  private createNotesError(
    type: NotesLoadingError['type'],
    message: string,
    details?: any,
  ): NotesLoadingError {
    return {
      type,
      message,
      details,
      retryable: type === 'network' || type === 'api',
    };
  }
}

export const relatedNotesService = new RelatedNotesService();
