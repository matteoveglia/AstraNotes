import { ftrackService } from "../ftrack";
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
 * A thin wrapper around the legacy `ftrackService` that exposes ONLY
 * playlist-oriented behaviour. During Phase 3 we gradually migrate
 * all playlist logic here. For now, we delegate calls to the existing
 * implementation to minimise risk while we update call-sites.
 *
 * IMPORTANT: Do **not** add any non-playlist concerns here. Version
 * search, status logic, note publishing etc. will live in their own
 * dedicated services.
 */
export class FtrackPlaylistService {
  /*
   * Project Management
   * ------------------------------------------------------------------
   */
  async getProjects(): Promise<Project[]> {
    return ftrackService.getProjects();
  }

  /*
   * Review Sessions ("playlists" in ftrack terminology)
   * ------------------------------------------------------------------
   */
  async getPlaylists(projectId?: string | null): Promise<Playlist[]> {
    return ftrackService.getPlaylists(projectId);
  }

  /*
   * ftrack Lists (another playlist-like entity)
   */
  async getLists(projectId?: string | null): Promise<Playlist[]> {
    return ftrackService.getLists(projectId);
  }

  /*
   * Unified helper that groups Review Sessions & Lists into categories.
   */
  async getPlaylistCategories(): Promise<PlaylistCategory[]> {
    return ftrackService.getPlaylistCategories();
  }

  /*
   * Create a brand-new Review Session in ftrack.
   */
  async createReviewSession(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    return ftrackService.createReviewSession(request);
  }

  /*
   * Create a new List in ftrack.
   */
  async createList(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    return ftrackService.createList(request);
  }

  /*
   * Fetch categories (List categories) from ftrack for the given project.
   */
  async getListCategories(projectId: string): Promise<PlaylistCategory[]> {
    return ftrackService.getListCategories(projectId);
  }

  /*
   * Add versions to either a Review Session or a List.
   */
  async addVersionsToPlaylist(
    playlistId: string,
    versionIds: string[],
    playlistType: "reviewsession" | "list" = "reviewsession",
  ): Promise<SyncVersionsResponse> {
    return ftrackService.addVersionsToPlaylist(playlistId, versionIds, playlistType);
  }

  /*
   * Get versions for a specific playlist.
   */
  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    return ftrackService.getPlaylistVersions(playlistId);
  }
}

// Export a singleton instance (consistent with existing service pattern)
export const ftrackPlaylistService = new FtrackPlaylistService(); 