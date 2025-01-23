import Dexie, { type Table } from 'dexie';
import type { Playlist, AssetVersion, NoteStatus } from '../types';

interface CachedVersion extends AssetVersion {
  playlistId: string;
  draftContent?: string;
  noteStatus?: NoteStatus;
  lastModified: number;
  isRemoved?: boolean;
}

interface CachedPlaylist extends Playlist {
  lastAccessed: number;
  lastChecked: number;
  hasModifications: boolean;
  addedVersions: string[];
  removedVersions: string[];
}

export class AstraNotesDB extends Dexie {
  playlists!: Table<CachedPlaylist>;
  versions!: Table<CachedVersion>;

  constructor() {
    super('AstraNotesDB');
    this.version(1).stores({
      playlists: 'id, lastAccessed, lastChecked',
      versions: 'id, playlistId, lastModified, isRemoved'
    });
  }

  async cleanOldData() {
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    await this.playlists
      .where('lastAccessed')
      .below(sixtyDaysAgo)
      .delete();
    
    // Get all active playlist IDs
    const activePlaylists = await this.playlists.toArray();
    const activePlaylistIds = new Set(activePlaylists.map(p => p.id));
    
    // Delete versions from inactive playlists
    await this.versions
      .where('playlistId')
      .noneOf([...activePlaylistIds])
      .delete();
  }
}

export const db = new AstraNotesDB();
