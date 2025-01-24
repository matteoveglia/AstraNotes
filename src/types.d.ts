export interface Note {
  id: string;
  title: string;
  content: string;
  status: "draft" | "published" | "reviewed";
  createdAt: string;
  updatedAt: string;
  selected?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  title: string;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
  isQuickNotes?: boolean;
}

export interface Settings {
  apiKey: string;
  serverUrl: string;
  theme: "light" | "dark" | "system";
}

export interface FtrackSettings {
  serverUrl: string;
  apiKey: string;
  apiUser: string;
}
