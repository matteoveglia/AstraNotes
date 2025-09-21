/**
 * @fileoverview types.ts
 * Shared types for the modular playlist store architecture.
 * These types support the stable UUID architecture with separate external references.
 *
 * Key Design Principles:
 * - Stable UUIDs that never change throughout playlist lifecycle
 * - Clear separation between local state and ftrack state
 * - Event-driven architecture for UI updates
 * - Backward compatibility with existing interfaces
 */

// Core playlist entity with stable UUID architecture
export interface PlaylistEntity {
  id: string; // STABLE UUID - never changes
  name: string;
  type: "reviewsession" | "list";

  // Status management - clear separation
  localStatus: "draft" | "ready_to_sync" | "synced";
  ftrackSyncStatus: "not_synced" | "syncing" | "synced" | "failed";
  ftrackStatus?: "open" | "closed";

  // External references - separate from identity
  ftrackId?: string; // NULL until synced
  projectId: string;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  deletedInFtrack?: boolean; // Flag if playlist was deleted in ftrack

  // Timestamps
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  lastChecked?: string | number; // Backward compatibility with existing DB
}

// Version entity tied to stable playlist ID
export interface VersionEntity {
  id: string; // Version ID from ftrack
  playlistId: string; // STABLE playlist UUID

  // Version data
  name: string;
  version: number;
  thumbnailUrl?: string;
  thumbnailId?: string;
  reviewSessionObjectId?: string;

  // Draft data
  draftContent?: string;
  labelId?: string; // Optional to match DB flexibility
  noteStatus: "empty" | "draft" | "published" | "reviewed"; // Include 'reviewed' for backward compatibility

  // Metadata
  addedAt: string;
  lastModified: number;
  manuallyAdded: boolean;
  isRemoved?: boolean;

  // Legacy compatibility - required fields in existing DB
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  attachments?: any[];
}

// Event types for the event system
export interface PlaylistEvent {
  type:
    | "sync-started"
    | "sync-completed"
    | "sync-failed"
    | "playlist-updated"
    | "sync-name-conflict-detected"
    | "sync-conflict-resolved";
  playlistId: string;
  data?: any;
  error?: string;
}

// Sync conflict event data
export interface SyncConflictEventData {
  playlistId: string;
  playlistName: string;
  playlistType: "reviewsession" | "list";
  projectId: string;
  errorMessage: string;
}

// Sync conflict resolution event data
export interface SyncConflictResolutionEventData {
  playlistId: string;
  action: "cancelled" | "renamed";
  newName?: string;
}

// Cache configuration
export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxEntries: number; // Maximum cache entries
  cleanupInterval: number; // Cleanup interval
}

// Sync progress info
export interface SyncProgress {
  current: number;
  total: number;
  step?: string;
}

// Repository operations interface
export interface PlaylistOperations {
  createPlaylist(entity: PlaylistEntity): Promise<void>;
  getPlaylist(id: string): Promise<PlaylistEntity | null>;
  updatePlaylist(id: string, updates: Partial<PlaylistEntity>): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  getPlaylistsByProject(projectId: string): Promise<PlaylistEntity[]>;
}

// Cache operations interface
export interface CacheOperations {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  invalidate(key: string): void;
  clear(): void;
}

// Sync operations interface
export interface SyncOperations {
  syncPlaylist(playlistId: string): Promise<void>;
  checkSyncStatus(
    playlistId: string,
  ): Promise<"not_synced" | "syncing" | "synced" | "failed">;
}

// Draft operations interface
export interface DraftOperations {
  saveDraft(
    playlistId: string,
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<void>;
  getDraftContent(
    playlistId: string,
    versionId: string,
  ): Promise<string | null>;
  clearDraft(playlistId: string, versionId: string): Promise<void>;
  publishNote(playlistId: string, versionId: string): Promise<void>;
}

// Type guards
export function isPlaylistEntity(obj: any): obj is PlaylistEntity {
  return obj && typeof obj.id === "string" && typeof obj.name === "string";
}

export function isVersionEntity(obj: any): obj is VersionEntity {
  return (
    obj && typeof obj.id === "string" && typeof obj.playlistId === "string"
  );
}
