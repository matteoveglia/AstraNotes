/**
 * Represents a playlist containing multiple note entries and optional asset versions.
 * @property id Unique identifier of the playlist.
 * @property name Internal name of the playlist.
 * @property title Display title for UI.
 * @property notes Array of associated notes.
 * @property createdAt ISO timestamp when the playlist was created.
 * @property updatedAt ISO timestamp when the playlist was last updated.
 * @property isQuickNotes Flag indicating the built-in Quick Notes playlist.
 * @property versions Optional list of asset versions linked to this playlist.
 */
export interface Playlist {
  id: string;
  name: string;
  title: string;
  versions?: AssetVersion[];
  notes: Note[];
  createdAt: string;
  updatedAt: string;
  isQuickNotes?: boolean;
}

/**
 * Supported statuses for a note entry.
 * @see Note.status
 */
export type NoteStatus = "draft" | "published" | "empty" | "reviewed";

/**
 * A single note within a playlist, including content and optional metadata.
 * @property id Unique note identifier.
 * @property content Markdown content of the note.
 * @property status Current status of the note.
 * @property selected Flag for UI selection state.
 * @property versionId ID of the associated asset version.
 * @property playlistId ID of the parent playlist.
 * @property createdAt ISO timestamp when the note was created.
 * @property updatedAt ISO timestamp when the note was last modified.
 * @property createdById Optional identifier of the author in ftrack.
 * @property author Optional display name of the note author.
 * @property frameNumber Optional frame number context for the note.
 */
export interface Note {
  id: string;
  content: string;
  status?: NoteStatus;
  selected?: boolean;
  versionId?: string;
  playlistId?: string;
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  author?: string;
  frameNumber?: number;
}

/**
 * Generic version object holding a thumbnail and metadata payload.
 */
export interface Version {
  id: string;
  thumbnail?: string;
  metadata: Record<string, unknown>;
}

/**
 * Configuration settings for connecting to an ftrack server.
 * @property serverUrl Base URL of the ftrack instance.
 * @property apiKey API key credential for authentication.
 * @property apiUser Username or system identifier for API usage.
 */
export interface FtrackSettings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
}

/**
 * Detailed representation of an asset version from ftrack, including optional flags.
 * @property id Unique identifier of the asset version.
 * @property name Descriptive name of the asset version.
 * @property version Numeric bump for version sequence.
 * @property thumbnailUrl Optional URL to a preview thumbnail image.
 * @property reviewSessionObjectId Optional ID linking to a review session.
 * @property createdAt ISO timestamp creation date.
 * @property updatedAt ISO timestamp last modification date.
 * @property manuallyAdded Flag indicating if version was added manually.
 */
export interface AssetVersion {
  id: string;
  name: string;
  version: number;
  thumbnailUrl?: string;
  thumbnailId?: string;
  reviewSessionObjectId?: string;
  createdAt: string;
  updatedAt: string;
  manuallyAdded?: boolean;
}

/**
 * Application-wide settings including API connection and theme.
 * @property apiKey API key for ftrack integration.
 * @property serverUrl Base server URL for application services.
 * @property theme UI color scheme mode.
 */
export interface Settings {
  apiKey: string;
  serverUrl: string;
  theme: Theme;
}

/**
 * Supported UI theme modes.
 */
export type Theme = "light" | "dark" | "system";
