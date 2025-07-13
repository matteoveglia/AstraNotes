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

// Local interface for ftrack session.create() responses
interface CreateResponse {
  id?: string;
  name?: string;
  created_at?: string;
  project_id?: string;
  date?: string;
  [key: string]: any;
}

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
    const username = this.getSettings()?.apiUser;
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
      categoryName:
        list["category.name"] || list.category?.name || "Uncategorized",
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

    const result: CreateResponse = await session.create("ReviewSession", {
      name: request.name,
      project_id: request.projectId,
      created_by_id: currentUserId,
    });

    this.log("Created review session:", result);

    return {
      id: result.id || "",
      name: result.name || request.name,
      type: "reviewsession",
      success: true,
    };
  }

  async createList(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    const session = await this.getSession();
    const currentUserId = await this.ensureCurrentUser(session);

    const result: CreateResponse = await session.create("List", {
      name: request.name,
      project_id: request.projectId,
      created_by_id: currentUserId,
      is_open: true,
    });

    this.log("Created list:", result);

    return {
      id: result.id || "",
      name: result.name || request.name,
      type: "list",
      success: true,
    };
  }

  async getListCategories(projectId: string): Promise<PlaylistCategory[]> {
    const session = await this.getSession();
    const query = `select id, name from ListCategory order by name`;
    const result = await session.query(query);

    return (result?.data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      type: "lists" as const,
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

    this.log(
      `Adding ${versionIds.length} versions to ${playlistType} ${playlistId}`,
    );

    const syncedVersionIds: string[] = [];
    const failedVersionIds: string[] = [];

    for (const versionId of versionIds) {
      try {
        if (playlistType === "reviewsession") {
          await session.create("ReviewSessionObject", {
            review_session_id: playlistId,
            asset_version_id: versionId,
            created_by_id: currentUserId,
          });
        } else {
          await session.create("ListObject", {
            list_id: playlistId,
            entity_id: versionId,
            created_by_id: currentUserId,
          });
        }
        syncedVersionIds.push(versionId);
      } catch (error) {
        this.log(`Failed to add version ${versionId}:`, error);
        failedVersionIds.push(versionId);
      }
    }

    return {
      playlistId,
      syncedVersionIds,
      failedVersionIds,
      success: failedVersionIds.length === 0,
      error:
        failedVersionIds.length > 0
          ? `Failed to add ${failedVersionIds.length} versions`
          : undefined,
    };
  }

  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    const session = await this.getSession();
    
    // First determine if this is a review session or list
    const reviewSessionQuery = `select id from ReviewSession where id is "${playlistId}"`;
    const reviewSessionResult = await session.query(reviewSessionQuery);

    if (reviewSessionResult?.data?.length > 0) {
      // Handle Review Session versions
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
    } else {
      // Check if this is a List
      const listQuery = `select id from List where id is "${playlistId}"`;
      const listResult = await session.query(listQuery);

      if (listResult?.data?.length > 0) {
        // Get entity IDs from ListObject table
        const listObjectQuery = `select entity_id from ListObject where list_id is "${playlistId}"`;
        const listObjectResult = await session.query(listObjectQuery);

        if (listObjectResult?.data?.length > 0) {
          const entityIds = listObjectResult.data.map(obj => obj.entity_id);
          
          // Fetch version details for all entities
          const query = `
            select 
              id,
              version,
              asset.name,
              thumbnail.id
            from AssetVersion
            where id in (${entityIds.map(id => `"${id}"`).join(", ")})
            order by date desc
          `;
          const result = await session.query(query);
          return this.mapVersionsToPlaylist(result?.data || []);
        }
      }
    }

    this.log(`Playlist ${playlistId} not found as review session or list`);
    return [];
  }
}

export const ftrackPlaylistService = new FtrackPlaylistService();
