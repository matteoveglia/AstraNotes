import { v4 as uuidv4 } from "uuid";
import { Playlist, Note, Version, FtrackSettings } from "@/types";

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
 * Create a mock Playlist with default values and optional overrides.
 */
export function createMockPlaylist(
  overrides: Partial<Playlist> = {},
): Playlist {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    name: "mock-playlist",
    title: "Mock Playlist",
    notes: createMockNotes(3),
    createdAt: now,
    updatedAt: now,
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
