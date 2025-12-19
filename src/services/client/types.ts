import type {
	AssetVersion,
	Playlist,
	PlaylistCategory,
	Project,
	CreatePlaylistRequest,
	CreatePlaylistResponse,
	SyncVersionsResponse,
	FtrackSettings,
} from "@/types";
import type { Attachment } from "@/components/NoteAttachments";

export interface VersionServiceContract {
	searchVersions(options: {
		searchTerm: string;
		limit?: number;
		projectId?: string | null;
	}): Promise<AssetVersion[]>;
	getVersionComponents(versionId: string): Promise<any[]>;
	fetchVersionDetails(versionId: string): Promise<any>;
	getComponentUrl(componentId: string): Promise<string | null>;
}

export interface NoteServiceContract {
	publishNote(
		versionId: string,
		content: string,
		labelId?: string,
	): Promise<string | null>;
	publishNoteWithAttachments(
		versionId: string,
		content: string,
		labelId?: string,
		attachments?: Attachment[],
	): Promise<string | null>;
	publishNoteWithAttachmentsAPI(
		versionId: string,
		content: string,
		attachments: Attachment[],
		labelId?: string,
	): Promise<string | null>;
	getNoteLabels(): Promise<Array<{ id: string; name: string; color: string }>>;
}

export interface PlaylistServiceContract {
	getProjects(): Promise<Project[]>;
	getPlaylists(projectId?: string | null): Promise<Playlist[]>;
	getLists(projectId?: string | null): Promise<Playlist[]>;
	getPlaylistCategories(): Promise<PlaylistCategory[]>;
	getListCategories(projectId?: string | null): Promise<PlaylistCategory[]>;
	getPlaylistVersions(playlistId: string): Promise<AssetVersion[]>;
	createReviewSession(
		request: CreatePlaylistRequest,
	): Promise<CreatePlaylistResponse>;
	createList(request: CreatePlaylistRequest): Promise<CreatePlaylistResponse>;
	addVersionsToPlaylist(
		playlistId: string,
		versionIds: string[],
		playlistType?: "reviewsession" | "list",
	): Promise<SyncVersionsResponse>;
}

export interface StatusServiceContract {
	fetchStatusPanelData(versionId: string): Promise<any>;
	getStatusesForEntity(entityType: string, entityId: string): Promise<any[]>;
	updateEntityStatus(
		entityType: string,
		entityId: string,
		statusId: string,
	): Promise<void>;
	getStatuses(versionId: string): Promise<any[]>;
	ensureStatusMappingsInitialized(): Promise<void>;
}

export interface AuthServiceContract {
	updateSettings(settings: FtrackSettings): Promise<void>;
	testConnection(): Promise<boolean>;
	getSession(): Promise<any>;
}
