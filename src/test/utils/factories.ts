import { v4 as uuidv4 } from "uuid";
import type {
	Playlist,
	Note,
	Version,
	FtrackSettings,
	AssetVersion,
} from "@/types";

/**
 * Create a mock Note with default values and optional overrides.
 */
export function createMockNote(overrides: Partial<Note> = {}): Note {
	const now = new Date().toISOString();
	return {
		id: uuidv4(),
		content: "Mock note content",
		status: "draft",
		selected: false,
		versionId: uuidv4(),
		playlistId: uuidv4(),
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

/**
 * Create multiple mock Notes.
 */
export function createMockNotes(
	count: number,
	overrides: Partial<Note> = {},
): Note[] {
	return Array.from({ length: count }, () => createMockNote(overrides));
}

/**
 * Create a mock AssetVersion with default values and optional overrides.
 */
export function createMockAssetVersion(
	overrides: Partial<AssetVersion> = {},
): AssetVersion {
	const now = new Date().toISOString();
	return {
		id: uuidv4(),
		name: "Mock_Shot_v001",
		version: 1,
		thumbnailUrl: "https://example.com/thumbnail.jpg",
		createdAt: now,
		updatedAt: now,
		manuallyAdded: false,
		...overrides,
	};
}

/**
 * Create multiple mock AssetVersions.
 */
export function createMockAssetVersions(
	count: number,
	overrides: Partial<AssetVersion> = {},
): AssetVersion[] {
	return Array.from({ length: count }, () => createMockAssetVersion(overrides));
}

/**
 * Create a mock Playlist with default values and optional overrides.
 * Updated to match the new stable UUID architecture.
 */
export function createMockPlaylist(
	overrides: Partial<Playlist> = {},
): Playlist {
	const now = new Date().toISOString();
	return {
		id: uuidv4(), // Stable UUID - never changes
		name: "Mock Playlist",
		title: "Mock Playlist",
		notes: createMockNotes(3),
		versions: createMockAssetVersions(2),
		createdAt: now,
		updatedAt: now,
		type: "reviewsession",
		projectId: uuidv4(),
		isLocalOnly: false,
		ftrackSyncState: "pending",
		// Optional fields
		ftrackId: undefined,
		categoryId: undefined,
		categoryName: undefined,
		description: undefined,
		isQuickNotes: false,
		...overrides,
	};
}

/**
 * Create a mock local playlist (for testing local-only scenarios).
 */
export function createMockLocalPlaylist(
	overrides: Partial<Playlist> = {},
): Playlist {
	const now = new Date().toISOString();
	return {
		id: uuidv4(),
		name: "Mock Local Playlist",
		title: "Mock Local Playlist",
		notes: createMockNotes(2),
		versions: createMockAssetVersions(1),
		createdAt: now,
		updatedAt: now,
		type: "list",
		projectId: uuidv4(),
		isLocalOnly: true,
		ftrackSyncState: "pending",
		// No ftrackId for local playlists
		ftrackId: undefined,
		isQuickNotes: false,
		...overrides,
	};
}

/**
 * Create a mock ftrack playlist (for testing synced scenarios).
 */
export function createMockFtrackPlaylist(
	overrides: Partial<Playlist> = {},
): Playlist {
	const now = new Date().toISOString();
	return {
		id: uuidv4(),
		name: "Mock Ftrack Playlist",
		title: "Mock Ftrack Playlist",
		notes: createMockNotes(2),
		versions: createMockAssetVersions(3),
		createdAt: now,
		updatedAt: now,
		type: "reviewsession",
		projectId: uuidv4(),
		isLocalOnly: false,
		ftrackSyncState: "synced",
		ftrackId: uuidv4(), // Has ftrack reference
		categoryId: uuidv4(),
		categoryName: "VFX Review",
		description: "Mock ftrack playlist for testing",
		isQuickNotes: false,
		...overrides,
	};
}

/**
 * Create a mock Version with default values and optional overrides.
 */
export function createMockVersion(overrides: Partial<Version> = {}): Version {
	return {
		id: uuidv4(),
		thumbnail: undefined,
		metadata: {},
		...overrides,
	};
}

/**
 * Create mock FtrackSettings with default values and optional overrides.
 */
export function createMockFtrackSettings(
	overrides: Partial<FtrackSettings> = {},
): FtrackSettings {
	return {
		serverUrl: "https://ftrack.example.com",
		apiKey: "mock-api-key",
		apiUser: "mock-user",
		...overrides,
	};
}
