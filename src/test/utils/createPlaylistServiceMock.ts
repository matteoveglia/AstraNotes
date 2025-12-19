import { vi } from "vitest";
import type {
	CreatePlaylistRequest,
	CreatePlaylistResponse,
	SyncVersionsResponse,
	Playlist,
	PlaylistCategory,
	Project,
	AssetVersion,
} from "@/types";
import type { PlaylistServiceContract } from "@/services/client/types";

interface PlaylistServiceMocks {
	getProjects: ReturnType<typeof vi.fn>;
	getPlaylists: ReturnType<typeof vi.fn>;
	getLists: ReturnType<typeof vi.fn>;
	getPlaylistCategories: ReturnType<typeof vi.fn>;
	getListCategories: ReturnType<typeof vi.fn>;
	getPlaylistVersions: ReturnType<typeof vi.fn>;
	createReviewSession: ReturnType<typeof vi.fn>;
	createList: ReturnType<typeof vi.fn>;
	addVersionsToPlaylist: ReturnType<typeof vi.fn>;
}

const buildCreateResponse = (
	request: CreatePlaylistRequest,
): CreatePlaylistResponse => ({
	id: `mock-${request.name}`,
	name: request.name,
	type: request.type,
	success: true,
});

export const createPlaylistServiceMock = (
	overrides: Partial<PlaylistServiceMocks> = {},
): { service: PlaylistServiceContract; mocks: PlaylistServiceMocks } => {
	const mocks: PlaylistServiceMocks = {
		getProjects: vi.fn(async () => [] as Project[]),
		getPlaylists: vi.fn(async () => [] as Playlist[]),
		getLists: vi.fn(async () => [] as Playlist[]),
		getPlaylistCategories: vi.fn(async () => [] as PlaylistCategory[]),
		getListCategories: vi.fn(async () => [] as PlaylistCategory[]),
		getPlaylistVersions: vi.fn(async () => [] as AssetVersion[]),
		createReviewSession: vi.fn(async (request: CreatePlaylistRequest) =>
			buildCreateResponse({ ...request, type: "reviewsession" }),
		),
		createList: vi.fn(async (request: CreatePlaylistRequest) =>
			buildCreateResponse({ ...request, type: "list" }),
		),
		addVersionsToPlaylist: vi.fn(
			async (
				playlistId: string,
				versionIds: string[],
			): Promise<SyncVersionsResponse> => ({
				playlistId,
				syncedVersionIds: [...versionIds],
				failedVersionIds: [],
				success: true,
			}),
		),
	};

	Object.assign(mocks, overrides);

	const service: PlaylistServiceContract = {
		getProjects: (...args) => mocks.getProjects(...args),
		getPlaylists: (...args) => mocks.getPlaylists(...args),
		getLists: (...args) => mocks.getLists(...args),
		getPlaylistCategories: (...args) => mocks.getPlaylistCategories(...args),
		getListCategories: (...args) => mocks.getListCategories(...args),
		getPlaylistVersions: (...args) => mocks.getPlaylistVersions(...args),
		createReviewSession: (...args) => mocks.createReviewSession(...args),
		createList: (...args) => mocks.createList(...args),
		addVersionsToPlaylist: (...args) => mocks.addVersionsToPlaylist(...args),
	};

	return { service, mocks };
};
