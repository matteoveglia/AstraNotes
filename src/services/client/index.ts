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

const selectService = <T>(realService: T, mockService: T): T => {
  const { appMode } = useAppModeStore.getState();
  return appMode === "demo" ? mockService : realService;
};

export const versionClient = () => selectService(ftrackVersionService, mockVersionService);

export const noteClient = () => selectService(ftrackNoteService, mockNoteService);

export const playlistClient = () =>
  selectService(ftrackPlaylistService, mockPlaylistService);

export const statusClient = () => selectService(ftrackStatusService, mockStatusService);

export const authClient = () => selectService(ftrackAuthService, mockAuthService);
