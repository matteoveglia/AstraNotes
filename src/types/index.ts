export interface Playlist {
  id: string;
  name: string;
  title: string;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
  isQuickNotes?: boolean;
}

export type NoteStatus = "draft" | "published" | "empty" | "reviewed";

export interface Note {
  id: string;
  content: string;
  status: NoteStatus;
  selected: boolean;
  versionId: string;
  playlistId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  thumbnail?: string;
  metadata: Record<string, unknown>;
}

export interface FtrackSettings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
}
