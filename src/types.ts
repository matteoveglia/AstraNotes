export interface FtrackSettings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  author?: string;
  frameNumber?: number;
}

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

export type NoteStatus = "empty" | "added" | "draft" | "published";

export interface Playlist {
  id: string;
  name: string;
  versions?: AssetVersion[];
  isQuickNotes?: boolean;
  title: string;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
}
