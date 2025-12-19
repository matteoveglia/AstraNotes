import { useAppModeStore } from "@/store/appModeStore";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";
import { ftrackNoteService } from "@/services/ftrack/FtrackNoteService";
import { ftrackPlaylistService } from "@/services/ftrack/FtrackPlaylistService";
import { ftrackStatusService } from "@/services/ftrack/FtrackStatusService";
import { ftrackVersionService } from "@/services/ftrack/FtrackVersionService";
import { mockAuthService } from "@/services/mock/MockAuthService";
import { mockNoteService } from "@/services/mock/MockNoteService";
import { mockPlaylistService } from "@/services/mock/MockPlaylistService";
import { mockStatusService } from "@/services/mock/MockStatusService";
import { mockVersionService } from "@/services/mock/MockVersionService";
import type {
	AuthServiceContract,
	NoteServiceContract,
	PlaylistServiceContract,
	StatusServiceContract,
	VersionServiceContract,
} from "./types";

const getMode = () => useAppModeStore.getState().appMode;

const versionServices: Record<"real" | "demo", () => VersionServiceContract> = {
	real: () => ftrackVersionService,
	demo: () => mockVersionService,
};

const noteServices: Record<"real" | "demo", () => NoteServiceContract> = {
	real: () => ftrackNoteService,
	demo: () => mockNoteService,
};

const playlistServices: Record<"real" | "demo", () => PlaylistServiceContract> =
	{
		real: () => ftrackPlaylistService,
		demo: () => mockPlaylistService,
	};

const statusServices: Record<"real" | "demo", () => StatusServiceContract> = {
	real: () => ftrackStatusService,
	demo: () => mockStatusService,
};

const authServices: Record<"real" | "demo", () => AuthServiceContract> = {
	real: () => ftrackAuthService,
	demo: () => mockAuthService,
};

export const versionClient = (): VersionServiceContract =>
	versionServices[getMode()]();

export const noteClient = (): NoteServiceContract => noteServices[getMode()]();

export const playlistClient = (): PlaylistServiceContract =>
	playlistServices[getMode()]();

export const statusClient = (): StatusServiceContract =>
	statusServices[getMode()]();

export const authClient = (): AuthServiceContract => authServices[getMode()]();
