export interface FtrackSettings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdById: string;
  frameNumber?: number;
}

export interface AssetVersion {
  id: string;
  name: string;
  version: string;
  reviewSessionObjectId: string;
  thumbnailUrl?: string;
}

export type NoteStatus = 'empty' | 'added' | 'draft' | 'published';

export interface Playlist {
  id: string;
  name: string;
  versions?: AssetVersion[];
  isQuickNotes?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  title: string;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
  isQuickNotes?: boolean;
  versions?: AssetVersion[];
}
