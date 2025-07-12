import { Session } from "@ftrack/api";
import { BaseFtrackClient } from "./BaseFtrackClient";
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
 */
export class FtrackPlaylistService extends BaseFtrackClient {
  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  private log(...args: any[]) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[FtrackPlaylistService]", ...args);
    }
  }

  private currentUserId: string | null = null;

  private async ensureCurrentUser(session: Session): Promise<string> {
    if (this.currentUserId) return this.currentUserId!;
    const username = this.settings?.apiUser;
    if (!username) {
      throw new Error("No API user configured");
    }
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
    const session = await this.getSession();
    const currentUserId = await this.ensureCurrentUser(session);

    const result = await session.create("ReviewSession", {
      name: request.name,
      project_id: request.projectId,
      created_by_id: currentUserId,
    });

    this.log("Created review session:", result);

    return {
      id: result.id,
      name: result.name,
      title: result.name,
      notes: [],
      createdAt: result.created_at,
      updatedAt: result.created_at,
      isQuickNotes: false,
      type: "reviewsession" as const,
      projectId: result.project_id,
    };
  }

  async createList(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    const session = await this.getSession();
    const currentUserId = await this.ensureCurrentUser(session);

    const result = await session.create("List", {
      name: request.name,
      project_id: request.projectId,
      created_by_id: currentUserId,
      is_open: true,
    });

    this.log("Created list:", result);

    return {
      id: result.id,
      name: result.name,
      title: result.name,
      notes: [],
      createdAt: result.date || new Date().toISOString(),
      updatedAt: result.date || new Date().toISOString(),
      isQuickNotes: false,
      type: "list" as const,
      projectId: result.project_id,
    };
  }

  async getListCategories(projectId: string): Promise<PlaylistCategory[]> {
    const session = await this.getSession();
    const query = `select id, name from ListCategory where project_id is "${projectId}" order by name`;
    const result = await session.query(query);

    return (result?.data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      type: "listcategory" as const,
      playlists: [],
    }));
  }

  async addVersionsToPlaylist(
    playlistId: string,
    versionIds: string[],
    playlistType: "reviewsession" | "list" = "reviewsession",
  ): Promise<SyncVersionsResponse> {
    const session = await this.getSession();
    const currentUserId = await this.ensureCurrentUser(session);

    this.log(`Adding ${versionIds.length} versions to ${playlistType} ${playlistId}`);

    const results = [];
    const errors = [];

    for (const versionId of versionIds) {
      try {
        const result = await session.create("ReviewSessionObject", {
          review_session_id: playlistId,
          asset_version_id: versionId,
          created_by_id: currentUserId,
        });
        results.push(result);
      } catch (error) {
        this.log(`Failed to add version ${versionId}:`, error);
        errors.push({ versionId, error: String(error) });
      }
    }

    return {
      added: results.length,
      errors: errors.length,
      errorDetails: errors,
    };
  }

  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    const session = await this.getSession();
    const query = `
      select 
        id,
        asset_version.id,
        asset_version.asset.name,
        asset_version.version,
        asset_version.thumbnail.id
      from ReviewSessionObject 
      where review_session_id is "${playlistId}"
      order by asset_version.asset.name, asset_version.version
    `;

    const result = await session.query(query);
    return this.mapVersionsToPlaylist(result?.data || []);
  }
}

export const ftrackPlaylistService = new FtrackPlaylistService(); 