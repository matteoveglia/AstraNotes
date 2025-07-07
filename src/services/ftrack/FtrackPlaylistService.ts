import { Session } from "@ftrack/api";
import { BaseFtrackClient } from "./BaseFtrackClient";
import { useSettings } from "@/store/settingsStore";
import type {
  Playlist,
  PlaylistCategory,
  SyncVersionsResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  Project,
  AssetVersion,
} from "@/types";

/**
 * FtrackPlaylistService
 * ----------------------------------
 * Handles playlist-oriented operations (projects, review sessions, lists …).
 *
 * ‑ If `settings.useMonolithFallback === true` we dynamically import the
 *   legacy monolith and delegate the call (zero regression risk).
 * ‑ When the flag is *false* we run a slimmed, focused implementation that
 *   talks directly to ftrack via BaseFtrackClient’s Session.
 */
export class FtrackPlaylistService extends BaseFtrackClient {
  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  private legacy: any | null = null;

  private async getLegacy() {
    if (!this.legacy) {
      const mod = await import("../legacy/ftrack");
      this.legacy = mod.ftrackService;
    }
    return this.legacy;
  }

  private isFallback() {
    return useSettings.getState().settings.useMonolithFallback;
  }

  private log(...args: any[]) {
    if (process.env.NODE_ENV === "development") {
       
      console.debug("[FtrackPlaylistService]", ...args);
    }
  }

  private currentUserId: string | null = null;

  private async ensureCurrentUser(session: Session): Promise<string> {
    if (this.currentUserId) return this.currentUserId!;
    const username = useSettings.getState().settings.apiUser;
    const result = await session.query(
      `select id from User where username is "${username}"`,
    );
    if (!result?.data?.length) {
      throw new Error("Could not determine current user in ftrack");
    }
    this.currentUserId = result.data[0].id;
    return this.currentUserId!;
  }

  private mapVersionsToPlaylist(versions: any[]): AssetVersion[] {
    return versions.map((version: any) => {
      const thumbnailId =
        version.asset_version?.thumbnail?.id ?? version.thumbnail?.id ?? null;
      return {
        id: version.asset_version?.id ?? version.id,
        name: version.asset_version?.asset?.name ?? version.asset?.name ?? "",
        version: version.asset_version?.version ?? version.version ?? 1,
        reviewSessionObjectId: version.id,
        thumbnailId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manuallyAdded: false,
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* API methods                                                        */
  /* ------------------------------------------------------------------ */
  async getProjects(): Promise<Project[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getProjects();
    }

    const session = await this.getSession();
    const query = `select id, name, full_name from Project order by name asc`;
    const response = await session.query(query);

    return response.data.map((project: any) => ({
      id: project.id,
      name: project.name,
      fullName: project.full_name || project.name,
      status: "Active" as const,
    }));
  }

  async getPlaylists(projectId?: string | null): Promise<Playlist[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getPlaylists(projectId);
    }

    const session = await this.getSession();
    let query = `select id, name, created_at, end_date, created_by_id, project_id from ReviewSession`;
    if (projectId) {
      query += ` where project_id is "${projectId}"`;
    }
    query += ` order by created_at desc`;
    const result = await session.query(query);

    return (result?.data || []).map((rs: any) => ({
      id: rs.id,
      name: rs.name,
      title: rs.name,
      notes: [],
      createdAt: rs.created_at,
      updatedAt: rs.end_date || rs.created_at,
      isQuickNotes: false,
      type: "reviewsession" as const,
      projectId: rs.project_id,
    }));
  }

  async getLists(projectId?: string | null): Promise<Playlist[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getLists(projectId);
    }

    const session = await this.getSession();
    let query = `select id, name, date, is_open, project_id, category_id, category.name from List where is_open is true`;
    if (projectId) {
      query += ` and project_id is "${projectId}"`;
    }
    query += ` order by category.name, name`;

    const result = await session.query(query);

    return (result?.data || []).map((list: any) => ({
      id: list.id,
      name: list.name,
      title: list.name,
      notes: [],
      createdAt: list.date || new Date().toISOString(),
      updatedAt: list.date || new Date().toISOString(),
      isQuickNotes: false,
      type: "list" as const,
      categoryId: list.category_id,
      categoryName: (list["category.name"] || list.category?.name) || "Uncategorized",
      isOpen: list.is_open,
      projectId: list.project_id,
    }));
  }

  async getPlaylistCategories(): Promise<PlaylistCategory[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getPlaylistCategories();
    }

    const [reviewSessions, lists] = await Promise.all([
      this.getPlaylists(),
      this.getLists(),
    ]);

    const categories: PlaylistCategory[] = [];

    if (reviewSessions.length) {
      categories.push({
        id: "review-sessions",
        name: "Review Sessions",
        type: "reviewsessions",
        playlists: reviewSessions,
      });
    }

    // group lists by category
    const byCat = new Map<string, Playlist[]>();
    lists.forEach((l) => {
      const key = l.categoryId || "uncategorized";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(l);
    });

    for (const [catId, catLists] of byCat) {
      const catName = catLists[0]?.categoryName || "Uncategorized";
      categories.push({
        id: catId,
        name: `${catName} Lists`,
        type: "lists",
        playlists: catLists,
      });
    }

    return categories;
  }

  async createReviewSession(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    if (this.isFallback()) {
      return (await this.getLegacy()).createReviewSession(request);
    }

    try {
      const session = await this.getSession();
      const userId = await this.ensureCurrentUser(session);
      const now = new Date();
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const response = await session.create("ReviewSession", {
        name: request.name,
        project_id: request.projectId,
        description: request.description || "",
        created_by_id: userId,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
      }) as any;

      const reviewSessionId = response.data?.id;
      return {
        id: reviewSessionId || "",
        name: response.data?.name || request.name,
        type: "reviewsession",
        success: !!reviewSessionId,
        error: reviewSessionId ? undefined : "Failed to create review session",
      };
    } catch (err: any) {
      this.log("Failed to create ReviewSession", err);
      return {
        id: "",
        name: request.name,
        type: "reviewsession",
        success: false,
        error: err?.message || "Creation failed",
      };
    }
  }

  async createList(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    if (this.isFallback()) {
      return (await this.getLegacy()).createList(request);
    }

    try {
      const session = await this.getSession();
      const userId = await this.ensureCurrentUser(session);
      if (!request.categoryId) {
        throw new Error("categoryId is required for lists");
      }
      const response = await session.create("AssetVersionList", {
        name: request.name,
        project_id: request.projectId,
        category_id: request.categoryId,
        owner_id: userId,
      }) as any;

      const listId = response.data?.id;
      return {
        id: listId || "",
        name: response.data?.name || request.name,
        type: "list",
        success: !!listId,
        error: listId ? undefined : "Failed to create list",
      };
    } catch (err: any) {
      this.log("Failed to create AssetVersionList", err);
      return {
        id: "",
        name: request.name,
        type: "list",
        success: false,
        error: err?.message || "Creation failed",
      };
    }
  }

  async getListCategories(projectId: string): Promise<PlaylistCategory[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getListCategories(projectId);
    }

    const session = await this.getSession();
    const result = await session.query(`select id, name from ListCategory`);
    return (result?.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: "lists" as const,
      playlists: [],
    }));
  }

  async addVersionsToPlaylist(
    playlistId: string,
    versionIds: string[],
    playlistType: "reviewsession" | "list" = "reviewsession",
  ): Promise<SyncVersionsResponse> {
    if (this.isFallback()) {
      return (await this.getLegacy()).addVersionsToPlaylist(
        playlistId,
        versionIds,
        playlistType,
      );
    }

    const session = await this.getSession();
    const synced: string[] = [];
    const failed: string[] = [];

    for (const versionId of versionIds) {
      try {
        if (playlistType === "reviewsession") {
          await session.create("ReviewSessionObject", {
            review_session_id: playlistId,
            asset_version_id: versionId,
          });
        } else {
          await session.create("ListObject", {
            list_id: playlistId,
            entity_id: versionId,
          });
        }
        synced.push(versionId);
      } catch (err) {
        this.log("Failed to add version", versionId, err);
        failed.push(versionId);
      }
    }

    return {
      success: failed.length === 0,
      syncedVersionIds: synced,
      failedVersionIds: failed,
      playlistId,
    };
  }

  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getPlaylistVersions(playlistId);
    }

    const session = await this.getSession();

    // Detect whether the id refers to ReviewSession or List
    const rsCheck = await session.query(`select id from ReviewSession where id is "${playlistId}"`);
    if (rsCheck?.data?.length) {
      const query = `select asset_version.id, asset_version.version, asset_version.asset.name, asset_version.thumbnail.id, id from ReviewSessionObject where review_session.id is "${playlistId}" order by sort_order`;
      const result = await session.query(query);
      return this.mapVersionsToPlaylist(result.data || []);
    }

    const listCheck = await session.query(`select id from List where id is "${playlistId}"`);
    if (listCheck?.data?.length) {
      const listObjQuery = await session.query(`select entity_id from ListObject where list_id is "${playlistId}"`);
      const entityIds = listObjQuery.data.map((o: any) => o.entity_id);
      if (!entityIds.length) return [];
      const query = `select id, version, asset.name, thumbnail.id from AssetVersion where id in (${entityIds.map((id: string) => `"${id}"`).join(", ")}) order by date desc`;
      const result = await session.query(query);
      return this.mapVersionsToPlaylist(result.data || []);
    }

    return [];
  }
}

// Singleton export
export const ftrackPlaylistService = new FtrackPlaylistService(); 