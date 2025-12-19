/**
 * @fileoverview RemovedNotesArchive.ts
 * Legacy compatibility stub. Note preservation is handled via soft-deleted
 * VersionRecord entries (isRemoved + draft fields) and 7-day TTL purge in
 * PlaylistStore flows. This class remains as a no-op to avoid breaking imports.
 */

export interface RemovedNoteArchiveRecord {
	playlistId: string;
	versionId: string;
	content: string;
	labelId?: string;
	archivedAt: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class RemovedNotesArchive {
	constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

	async save(
		_playlistId: string,
		_versionId: string,
		_content: string,
		_labelId?: string,
		_archivedAt: number = Date.now(),
	): Promise<void> {
		// No-op: preservation handled in VersionRecord via isRemoved + draft fields
		return;
	}

	async get(
		_playlistId: string,
		_versionId: string,
	): Promise<RemovedNoteArchiveRecord | undefined> {
		// No-op
		return undefined;
	}

	async delete(_playlistId: string, _versionId: string): Promise<void> {
		// No-op
		return;
	}

	isExpired(archivedAt: number): boolean {
		return Date.now() - archivedAt > this.ttlMs;
	}

	async purgeExpired(): Promise<number> {
		// No-op
		return 0;
	}

	async listAll(): Promise<RemovedNoteArchiveRecord[]> {
		// No-op
		return [];
	}

	async listExpired(): Promise<RemovedNoteArchiveRecord[]> {
		// No-op
		return [];
	}
}
