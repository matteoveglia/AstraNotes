import { demoSeed } from "@/services/mock/demoSeed";
import type {
  AssetVersion,
  Playlist,
  PlaylistCategory,
  Project,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  SyncVersionsResponse,
} from "@/types";
import type { PlaylistServiceContract } from "@/services/client/types";

const delay = async () =>
  new Promise((resolve) => setTimeout(resolve, 130 + Math.random() * 220));

const versionMap = new Map<string, AssetVersion>(
  demoSeed.assetVersions.map((seed) => [
    seed.id,
    {
      id: seed.id,
      name: seed.displayName,
      version: seed.versionNumber,
      createdAt: seed.publishedAt,
      updatedAt: seed.publishedAt,
      manuallyAdded: false,
      thumbnailId: seed.componentIds[0],
    },
  ]),
);

const playlists = new Map<string, Playlist>(
  demoSeed.playlists.map((seed) => [
    seed.id,
    {
      id: seed.id,
      name: seed.name,
      title: seed.name,
      notes: [],
      createdAt: seed.date
        ? `${seed.date}T00:00:00Z`
        : new Date().toISOString(),
      updatedAt: seed.date
        ? `${seed.date}T00:00:00Z`
        : new Date().toISOString(),
      type: seed.type,
      categoryName: seed.categoryName,
      description: seed.description,
      versions: seed.versionIds
        .map((id) => versionMap.get(id))
        .filter(Boolean) as AssetVersion[],
    },
  ]),
);

const playlistAssignments = new Map<string, Set<string>>(
  demoSeed.playlists.map((seed) => [seed.id, new Set(seed.versionIds)]),
);

const ensurePlaylist = (playlistId: string): Playlist | undefined =>
  playlists.get(playlistId);

const createPlaylistInternal = (
  request: CreatePlaylistRequest,
): CreatePlaylistResponse => {
  const id = `demo:playlist:${request.name}:${Date.now()}`;
  const type = request.type ?? "list";
  const playlist: Playlist = {
    id,
    name: request.name,
    title: request.name,
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type,
    categoryName: request.categoryName ?? "Demo",
    categoryId: request.categoryId,
    projectId: request.projectId ?? demoSeed.project.id,
    versions: [],
  };
  playlists.set(id, playlist);
  playlistAssignments.set(id, new Set());
  return {
    id,
    name: playlist.name,
    type,
    success: true,
  };
};

export const mockPlaylistService: PlaylistServiceContract = {
  async getProjects(): Promise<Project[]> {
    await delay();
    return [
      {
        id: demoSeed.project.id,
        name: demoSeed.project.name,
        fullName: demoSeed.project.fullName,
        status: "Active",
      },
    ];
  },
  async getPlaylists(projectId?: string | null): Promise<Playlist[]> {
    await delay();
    if (projectId && projectId !== demoSeed.project.id) {
      return [];
    }
    return Array.from(playlists.values())
      .filter((playlist) => playlist.type === "reviewsession")
      .map((playlist) => ({
        ...playlist,
        versions: playlist.versions ? [...playlist.versions] : [],
        projectId: demoSeed.project.id,
      }));
  },
  async getLists(projectId?: string | null): Promise<Playlist[]> {
    await delay();
    if (projectId && projectId !== demoSeed.project.id) {
      return [];
    }
    return Array.from(playlists.values())
      .filter((playlist) => playlist.type === "list")
      .map((playlist) => ({
        ...playlist,
        versions: playlist.versions ? [...playlist.versions] : [],
        projectId: demoSeed.project.id,
      }));
  },
  async getPlaylistCategories(): Promise<PlaylistCategory[]> {
    await delay();
    const categories = new Map<string, PlaylistCategory>();
    demoSeed.playlists.forEach((seed) => {
      if (!seed.categoryId || !seed.categoryName) return;
      if (!categories.has(seed.categoryId)) {
        categories.set(seed.categoryId, {
          id: seed.categoryId,
          name: `${seed.categoryName} Lists`,
          type: "lists",
          playlists: [],
        });
      }
    });
    if (!categories.size) {
      categories.set("demo", {
        id: "demo",
        name: "Demo Lists",
        type: "lists",
        playlists: [],
      });
    }
    return Array.from(categories.values());
  },
  async getListCategories(
    projectId?: string | null,
  ): Promise<PlaylistCategory[]> {
    if (projectId && projectId !== demoSeed.project.id) {
      return [];
    }
    return this.getPlaylistCategories();
  },
  async getPlaylistVersions(playlistId: string): Promise<AssetVersion[]> {
    await delay();
    const playlist = ensurePlaylist(playlistId);
    if (!playlist) {
      return [];
    }
    return playlist.versions ? [...playlist.versions] : [];
  },
  async createReviewSession(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    await delay();
    return createPlaylistInternal({ ...request, type: "reviewsession" });
  },
  async createList(
    request: CreatePlaylistRequest,
  ): Promise<CreatePlaylistResponse> {
    await delay();
    return createPlaylistInternal({ ...request, type: "list" });
  },
  async addVersionsToPlaylist(
    playlistId: string,
    versionIds: string[],
    _playlistType: "reviewsession" | "list" = "reviewsession",
  ): Promise<SyncVersionsResponse> {
    await delay();
    const playlist = ensurePlaylist(playlistId);
    if (!playlist) {
      return {
        playlistId,
        syncedVersionIds: [],
        failedVersionIds: versionIds,
        success: false,
        error: `Playlist ${playlistId} not found`,
      };
    }

    const assigned = playlistAssignments.get(playlistId) ?? new Set<string>();
    const additions = versionIds.filter((id) => !assigned.has(id));
    const addedVersions = additions
      .map((id) => versionMap.get(id))
      .filter(Boolean) as AssetVersion[];

    playlist.versions = [...(playlist.versions ?? []), ...addedVersions];
    playlist.updatedAt = new Date().toISOString();

    additions.forEach((id) => assigned.add(id));
    playlistAssignments.set(playlistId, assigned);

    const failedVersionIds = versionIds.filter((id) => !assigned.has(id));

    return {
      playlistId,
      syncedVersionIds: additions,
      failedVersionIds,
      success: failedVersionIds.length === 0,
    };
  },
};
