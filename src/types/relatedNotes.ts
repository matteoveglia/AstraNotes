/**
 * @fileoverview relatedNotes.ts
 * Type definitions for the Related Notes feature.
 * Defines interfaces for shot notes, labels, attachments, and filtering/sorting.
 */

/**
 * Represents a note from ftrack with all associated metadata
 */
export interface ShotNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  version: {
    id: string;
    name: string;
    version: number;
    thumbnailId?: string;
    thumbnailUrl?: string;
  };
  labels: NoteLabel[];
  attachments: NoteAttachment[];
}

/**
 * Represents a note label with color information
 */
export interface NoteLabel {
  id: string;
  name: string;
  color: string;
}

/**
 * Represents a note attachment with metadata
 */
export interface NoteAttachment {
  id: string;
  name: string;
  type: string;
  url?: string;
  thumbnailUrl?: string;
  size?: number;
}

/**
 * Filter configuration for related notes
 */
export interface RelatedNotesFilter {
  searchTerm: string;
  authorIds: string[];
  labelIds: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Sort configuration for related notes
 */
export interface RelatedNotesSortConfig {
  field: "createdAt" | "updatedAt" | "author" | "version";
  direction: "asc" | "desc";
}

/**
 * Raw note data from ftrack API before processing
 */
export interface RawNoteData {
  id: string;
  content: string;
  created_date: string;
  user_id: string;
  parent_id: string;
  parent_type: string;
}

/**
 * Raw user data from ftrack API
 */
export interface RawUserData {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Raw version data from ftrack API
 */
export interface RawVersionData {
  id: string;
  version: number;
  asset: {
    name: string;
  };
  thumbnail?: {
    id: string;
  };
}

/**
 * Raw label link data from ftrack API
 */
export interface RawLabelLinkData {
  note_id: string;
  label: {
    id: string;
    name: string;
    color: string;
  };
}

/**
 * Raw attachment data from ftrack API
 */
export interface RawAttachmentData {
  note_id: string;
  component: {
    id: string;
    name: string;
    file_type: string;
    size?: number;
  };
}

/**
 * Cache entry for shot notes
 */
export interface ShotNotesCache {
  shotName: string;
  notes: ShotNote[];
  timestamp: number;
  ttl: number;
}

/**
 * Progress information for loading notes
 */
export interface NotesLoadingProgress {
  current: number;
  total: number;
  step: "notes" | "users" | "versions" | "labels" | "attachments";
}

/**
 * Error information for note loading failures
 */
export interface NotesLoadingError {
  type: "network" | "api" | "parsing" | "unknown";
  message: string;
  details?: any;
  retryable: boolean;
}
