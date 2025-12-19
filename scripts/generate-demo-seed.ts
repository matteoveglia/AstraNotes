import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

interface VersionCsvRecord {
	SHOT?: string;
	"VERSION NUMBER"?: string;
	"ASSET VERSION NAME"?: string;
	"VERSION STATUS"?: string;
	"SHOT STATUS"?: string;
	"ASSET TYPE"?: string;
	"PUBLISHED BY"?: string;
	"PUBLISHED AT"?: string;
	DESCRIPTION?: string;
	"THUMBNAIL FILENAME"?: string;
	"MOVIE FILENAME"?: string;
	[key: string]: unknown;
}

interface PlaylistCsvRecord {
	"PLAYLIST NAME"?: string;
	"PLAYLIST TYPE"?: string;
	"PLAYLIST CATEGORY"?: string;
	DESCRIPTION?: string;
	[key: string]: unknown;
}

interface LabelCsvRecord {
	"LABEL NAME"?: string;
	COLOUR?: string;
	[key: string]: unknown;
}

interface StatusCsvRecord {
	STATUS?: string;
	COLOUR?: string;
	[key: string]: unknown;
}

interface NoteCsvRecord {
	NOTE?: string;
	[key: string]: unknown;
}

interface DemoStatusSeed {
	id: string;
	name: string;
	colorToken: {
		text: string;
		background: string;
		border: string;
	};
}

interface DemoLabelSeed extends DemoStatusSeed {}

interface DemoAssetVersionSeed {
	id: string;
	ftrackId: string;
	displayName: string;
	versionNumber: number;
	assetType: string;
	shot: string;
	status: string;
	publishedBy: string;
	publishedAt: string;
	description?: string;
	thumbnailFilename: string;
	movieFilename?: string;
	componentIds: string[];
	shotStatus?: string;
}

interface DemoPlaylistSeed {
	id: string;
	name: string;
	type: "reviewsession" | "list";
	categoryName?: string;
	categoryId?: string;
	description?: string;
	date?: string;
	versionIds: string[];
}

interface DemoNoteSeed {
	id: string;
	versionId: string;
	author: string;
	body: string;
	createdAt: string;
	labelId?: string;
}

interface DemoSeedPayload {
	seedVersion: string;
	project: {
		id: string;
		name: string;
		fullName: string;
	};
	assetVersions: DemoAssetVersionSeed[];
	playlists: DemoPlaylistSeed[];
	notes: DemoNoteSeed[];
	noteLabels: DemoLabelSeed[];
	shotStatuses: DemoStatusSeed[];
	versionStatuses: DemoStatusSeed[];
}

const COLOR_TOKENS: Record<string, DemoStatusSeed["colorToken"]> = {
	grey: {
		text: "text-zinc-500",
		background: "bg-zinc-100",
		border: "border-zinc-200",
	},
	"light grey": {
		text: "text-zinc-400",
		background: "bg-zinc-50",
		border: "border-zinc-200",
	},
	blue: {
		text: "text-blue-600",
		background: "bg-blue-100",
		border: "border-blue-200",
	},
	"light purple": {
		text: "text-violet-500",
		background: "bg-violet-100",
		border: "border-violet-200",
	},
	purple: {
		text: "text-violet-600",
		background: "bg-violet-100",
		border: "border-violet-200",
	},
	peach: {
		text: "text-orange-500",
		background: "bg-orange-100",
		border: "border-orange-200",
	},
	orange: {
		text: "text-amber-600",
		background: "bg-amber-100",
		border: "border-amber-200",
	},
	green: {
		text: "text-green-600",
		background: "bg-green-100",
		border: "border-green-200",
	},
	"darker green": {
		text: "text-emerald-600",
		background: "bg-emerald-100",
		border: "border-emerald-200",
	},
	red: {
		text: "text-red-600",
		background: "bg-red-100",
		border: "border-red-200",
	},
};

const DELIVERY_EXCLUDE_STATUSES = new Set(["WIP", "Work In Progress"]);

const DEMO_PROJECT = {
	id: "demo:project:bbb",
	name: "Big Buck Bunny",
	fullName: "Big Buck Bunny Demo Project",
};

const VERSION_STATUS_FALLBACK_SEQUENCE = [
	"WIP",
	"In Progress",
	"Pending Review",
	"Approved",
] as const;

function resolveColorToken(name: string): DemoStatusSeed["colorToken"] {
	const normalized = name.trim().toLowerCase();
	const token = COLOR_TOKENS[normalized];
	if (!token) {
		console.warn(
			"[generate-demo-seed] Unknown color token encountered, defaulting to grey:",
			name,
		);
		return COLOR_TOKENS.grey;
	}
	return token;
}

const safeTrim = (value: unknown): string => {
	if (typeof value === "string") {
		return value.trim();
	}
	if (value == null) {
		return "";
	}
	return String(value).trim();
};

const fallbackTrim = (value: unknown, fallback: string): string => {
	const trimmed = safeTrim(value);
	return trimmed || fallback;
};

function stableId(prefix: string, value: string): string {
	const hash = createHash("sha1").update(value).digest("hex");
	return `${prefix}:${hash.slice(0, 12)}`;
}

const normalizeCsvKey = (key: string): string =>
	key
		.replace(/\uFEFF/g, "")
		.replace(/\s+/g, " ")
		.trim();

function normalizeRecordKeys(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(record)) {
		const key = normalizeCsvKey(rawKey);
		if (!key) continue;
		normalized[key] = value;
	}
	return normalized;
}

async function parseCsv<T extends Record<string, unknown>>(
	filePath: string,
): Promise<T[]> {
	const content = await fs.readFile(filePath, "utf8");
	const rawRecords = parse(content, {
		columns: true,
		skip_empty_lines: true,
		trim: true,
	}) as Record<string, unknown>[];
	return rawRecords.map((record) => normalizeRecordKeys(record)) as T[];
}

function ensureDateISOString(value: string, fallback: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return fallback;
	}
	return date.toISOString();
}

function toLocalDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso.slice(0, 10);
	}
	return date.toISOString().slice(0, 10);
}

function parsePlaylistDate(name: string): string | undefined {
	const match = name.match(/^(\d{4})_(\d{2})_(\d{2})/);
	if (!match) return undefined;
	const [_, year, month, day] = match;
	return `${year}-${month}-${day}`;
}

function normalizePlaylistType(type: string): "reviewsession" | "list" {
	const normalized = type.trim().toLowerCase();
	if (normalized === "review session" || normalized === "reviewsession") {
		return "reviewsession";
	}
	if (normalized === "list") {
		return "list";
	}
	throw new Error(`Unrecognized playlist type: ${type}`);
}

function normalizeStatusName(status: string): string {
	const trimmed = status.trim();
	if (!trimmed) {
		return "WIP";
	}
	return trimmed
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b(\w)/g, (m) => m.toUpperCase());
}

function getField(
	record: Record<string, unknown>,
	...aliases: string[]
): string {
	for (const alias of aliases) {
		const key = normalizeCsvKey(alias);
		const value = record[key];
		if (typeof value === "string") {
			return value;
		}
		if (value != null) {
			return String(value);
		}
	}

	for (const [rawKey, value] of Object.entries(record)) {
		const normalizedKey = normalizeCsvKey(rawKey);
		if (
			aliases.some(
				(alias) =>
					normalizeCsvKey(alias).toLowerCase() === normalizedKey.toLowerCase(),
			)
		) {
			if (typeof value === "string") {
				return value;
			}
			if (value != null) {
				return String(value);
			}
		}
	}

	return "";
}

function buildAssetVersions(
	records: VersionCsvRecord[],
): DemoAssetVersionSeed[] {
	const byShot = new Map<string, VersionCsvRecord[]>();
	for (const record of records) {
		const recordMap = record as Record<string, unknown>;
		let shot = safeTrim(record.SHOT);
		if (!shot) {
			shot = safeTrim(getField(recordMap, "SHOT", "Shot", "shot"));
		}
		if (!shot) {
			console.warn(
				"[generate-demo-seed] Skipping version row without SHOT",
				record,
			);
			continue;
		}
		if (!byShot.has(shot)) {
			byShot.set(shot, []);
		}
		byShot.get(shot)!.push(record);
	}

	const result: DemoAssetVersionSeed[] = [];

	for (const [shot, versions] of byShot) {
		const sorted = versions
			.map((record) => ({
				record,
				versionNumber:
					Number.parseInt(record["VERSION NUMBER"] ?? "1", 10) || 1,
			}))
			.sort((a, b) => a.versionNumber - b.versionNumber);

		const maxVersion = sorted.at(-1)?.versionNumber ?? 1;
		const baseRecord = sorted[0]?.record ?? versions[0];
		if (!baseRecord) {
			console.warn(
				"[generate-demo-seed] Shot had no valid base record; skipping",
				shot,
			);
			continue;
		}
		const baseName = fallbackTrim(baseRecord["ASSET VERSION NAME"], shot);
		const thumbnailFilename = fallbackTrim(
			baseRecord["THUMBNAIL FILENAME"],
			"placeholder.jpg",
		);
		const movieFilename = safeTrim(baseRecord["MOVIE FILENAME"]);

		const publishedStartedAt = ensureDateISOString(
			baseRecord["PUBLISHED AT"] ?? "",
			new Date().toISOString(),
		);

		const basePublishedDate = new Date(publishedStartedAt).getTime();
		const decrementMs = 1000 * 60 * 60 * 6; // 6 hours per step

		const existingByVersion = new Map<number, VersionCsvRecord>();
		for (const { record, versionNumber } of sorted) {
			existingByVersion.set(versionNumber, record);
		}

		for (
			let versionNumber = 1;
			versionNumber <= maxVersion;
			versionNumber += 1
		) {
			const existing = existingByVersion.get(versionNumber);
			const record = existing ?? baseRecord;
			const recordMapLocal = record as Record<string, unknown>;
			const baseRecordMap = baseRecord as Record<string, unknown>;
			const displayName = existing
				? fallbackTrim(record["ASSET VERSION NAME"], baseName)
				: `${baseName}_v${versionNumber.toString().padStart(2, "0")}`;
			const status = normalizeStatusName(record["VERSION STATUS"] ?? "WIP");
			const shotStatus = record["SHOT STATUS"]
				? normalizeStatusName(record["SHOT STATUS"])
				: undefined;

			const publishedAt = existing
				? ensureDateISOString(record["PUBLISHED AT"] ?? "", publishedStartedAt)
				: new Date(
						basePublishedDate - (maxVersion - versionNumber) * decrementMs,
					).toISOString();

			const description =
				safeTrim(record.DESCRIPTION) || safeTrim(baseRecord.DESCRIPTION);
			const publishedBy =
				fallbackTrim(
					record["PUBLISHED BY"],
					fallbackTrim(baseRecord["PUBLISHED BY"], "Demo Artist"),
				) || "Demo Artist";
			const assetType =
				fallbackTrim(
					record["ASSET TYPE"],
					fallbackTrim(baseRecord["ASSET TYPE"], "General"),
				) || "General";

			const shotFallback =
				safeTrim(record.SHOT) ||
				safeTrim(getField(recordMapLocal, "SHOT", "Shot")) ||
				safeTrim(getField(baseRecordMap, "SHOT", "Shot")) ||
				shot;
			const idBase = `${shotFallback}_v${versionNumber.toString().padStart(3, "0")}`;
			const versionId = `demo:version:${idBase.toLowerCase()}`;
			const ftrackId = idBase.toLowerCase();
			const componentId = `demo:component:${shotFallback.toLowerCase()}_${versionNumber}`;

			result.push({
				id: versionId,
				ftrackId,
				displayName,
				versionNumber,
				assetType,
				shot,
				status,
				shotStatus,
				publishedBy,
				publishedAt,
				description,
				thumbnailFilename,
				movieFilename: movieFilename || undefined,
				componentIds: [componentId],
			});
		}
	}

	return result.sort((a, b) => a.id.localeCompare(b.id));
}

function buildStatuses(
	records: StatusCsvRecord[],
	prefix: string,
): DemoStatusSeed[] {
	return records
		.map((record) => {
			const recordMap = record as Record<string, unknown>;
			const statusName = safeTrim(
				record.STATUS ??
					getField(
						recordMap,
						"STATUS",
						"Status",
						"SHOT STATUSES",
						"Shot Statuses",
						"Version Statuses",
						"VERSION STATUSES",
					),
			);
			const colour = safeTrim(
				record.COLOUR ??
					getField(recordMap, "COLOUR", "Colour", "color", "Color"),
			);
			if (!statusName) {
				console.warn(
					"[generate-demo-seed] Skipping status without name",
					record,
				);
				return null;
			}
			if (!colour) {
				console.warn(
					"[generate-demo-seed] Skipping status due to missing colour token",
					record,
				);
				return null;
			}
			const name = normalizeStatusName(statusName);
			return {
				id: stableId(prefix, name),
				name,
				colorToken: resolveColorToken(colour),
			};
		})
		.filter((seed): seed is DemoStatusSeed => Boolean(seed));
}

function buildLabels(records: LabelCsvRecord[]): DemoLabelSeed[] {
	return records
		.map((record) => {
			const name = safeTrim(record["LABEL NAME"]);
			const colour = safeTrim(record.COLOUR);
			if (!name || !colour) {
				console.warn(
					"[generate-demo-seed] Skipping note label due to missing data",
					record,
				);
				return null;
			}
			return {
				id: stableId("demo:label", name.toLowerCase()),
				name,
				colorToken: resolveColorToken(colour),
			};
		})
		.filter((seed): seed is DemoLabelSeed => Boolean(seed));
}

function buildPlaylists(
	records: PlaylistCsvRecord[],
	assetVersions: DemoAssetVersionSeed[],
): DemoPlaylistSeed[] {
	const playlists: DemoPlaylistSeed[] = [];
	const deliveryPlaylists: DemoPlaylistSeed[] = [];

	const versionsByDate = assetVersions.map((version) => ({
		...version,
		publishedDate: toLocalDate(version.publishedAt),
		publishedTimestamp: new Date(version.publishedAt).getTime(),
	}));

	const deliveryCandidates = versionsByDate.filter(
		(version) => !DELIVERY_EXCLUDE_STATUSES.has(version.status),
	);

	for (const record of records) {
		const recordMap = record as Record<string, unknown>;
		const name = safeTrim(
			record["PLAYLIST NAME"] ??
				getField(recordMap, "PLAYLIST NAME", "Playlist Name", "Name"),
		);
		const typeRaw = safeTrim(
			record["PLAYLIST TYPE"] ??
				getField(recordMap, "PLAYLIST TYPE", "Playlist Type", "Type"),
		);
		if (!name) {
			console.warn(
				"[generate-demo-seed] Skipping playlist row without name",
				record,
			);
			continue;
		}
		if (!typeRaw) {
			console.warn(
				"[generate-demo-seed] Skipping playlist due to missing type",
				record,
			);
			continue;
		}
		const type = normalizePlaylistType(typeRaw);
		const categoryName = safeTrim(
			record["PLAYLIST CATEGORY"] ??
				getField(recordMap, "PLAYLIST CATEGORY", "Category"),
		);
		const date = parsePlaylistDate(name);
		const description = safeTrim(
			record.DESCRIPTION ?? getField(recordMap, "DESCRIPTION", "Description"),
		);
		const playlistId = stableId("demo:playlist", name.toLowerCase());

		const playlist: DemoPlaylistSeed = {
			id: playlistId,
			name,
			type,
			categoryName,
			description,
			date,
			versionIds: [],
		};

		playlists.push(playlist);

		if (type === "list" && categoryName?.toLowerCase() === "delivery") {
			deliveryPlaylists.push(playlist);
		}
	}

	const playlistsById = new Map(
		playlists.map((playlist) => [playlist.id, playlist]),
	);

	const playlistsByCategory = (
		category: string,
		type: "reviewsession" | "list",
	) =>
		playlists.filter((playlist) => {
			if (playlist.type !== type) return false;
			return (
				(playlist.categoryName ?? "").toLowerCase() === category.toLowerCase()
			);
		});

	const dateToReview = new Map<string, DemoPlaylistSeed[]>();
	const dateToDailies = new Map<string, DemoPlaylistSeed[]>();

	for (const playlist of playlists) {
		if (!playlist.date) continue;
		const targetMap =
			playlist.type === "reviewsession"
				? dateToReview
				: playlist.categoryName?.toLowerCase() === "dailies"
					? dateToDailies
					: null;
		if (!targetMap) continue;
		if (!targetMap.has(playlist.date)) {
			targetMap.set(playlist.date, []);
		}
		targetMap.get(playlist.date)!.push(playlist);
	}

	const assignToPlaylists = (
		playlistIds: DemoPlaylistSeed[],
		predicate: (version: (typeof versionsByDate)[number]) => boolean,
	) => {
		for (const playlist of playlistIds) {
			playlist.versionIds = versionsByDate
				.filter(predicate)
				.filter((version) => {
					if (!playlist.date) return true;
					return toLocalDate(version.publishedAt) === playlist.date;
				})
				.sort(
					(a, b) =>
						a.publishedTimestamp - b.publishedTimestamp ||
						a.shot.localeCompare(b.shot),
				)
				.map((version) => version.id);
		}
	};

	// Dailies playlists
	for (const [, playlistsForDate] of dateToDailies) {
		assignToPlaylists(playlistsForDate, (version) => true);
	}

	// Review sessions
	for (const [, playlistsForDate] of dateToReview) {
		assignToPlaylists(playlistsForDate, (version) => true);
	}

	// Delivery playlists with uniqueness constraint
	const deliveryByDate = deliveryPlaylists
		.filter((playlist) => playlist.date)
		.sort((a, b) => (a.date! < b.date! ? -1 : 1));

	const deliveryAssignments = new Map<string, string>();
	for (const version of deliveryCandidates.sort(
		(a, b) => a.publishedTimestamp - b.publishedTimestamp,
	)) {
		let target: DemoPlaylistSeed | undefined;
		for (const playlist of deliveryByDate) {
			if (!playlist.date) continue;
			const playlistTime = new Date(`${playlist.date}T00:00:00Z`).getTime();
			if (version.publishedTimestamp <= playlistTime) {
				target = playlist;
				break;
			}
		}
		target ??= deliveryByDate.at(-1);
		if (!target) continue;
		deliveryAssignments.set(version.id, target.id);
	}

	for (const playlist of deliveryPlaylists) {
		playlist.versionIds = deliveryCandidates
			.filter((version) => deliveryAssignments.get(version.id) === playlist.id)
			.sort(
				(a, b) =>
					a.publishedTimestamp - b.publishedTimestamp ||
					a.shot.localeCompare(b.shot),
			)
			.map((version) => version.id);
	}

	// Collection playlists (month-based)
	const collectionPlaylists = playlistsByCategory("collection", "list");
	if (collectionPlaylists.length) {
		const monthRegex =
			/(January|February|March|April|May|June|July|August|September|October|November|December)/i;
		for (const playlist of collectionPlaylists) {
			const match = playlist.name.match(monthRegex);
			if (!match) continue;
			const monthName = match[1].toLowerCase();
			playlist.versionIds = versionsByDate
				.filter(
					(version) =>
						new Date(version.publishedAt)
							.toLocaleString("en-US", { month: "long" })
							.toLowerCase() === monthName,
				)
				.map((version) => version.id);
		}
	}

	return playlists.map((playlist) => ({
		...playlist,
		versionIds: Array.from(new Set(playlist.versionIds ?? [])),
	}));
}

function buildNotes(
	noteRecords: NoteCsvRecord[],
	assetVersions: DemoAssetVersionSeed[],
	labels: DemoLabelSeed[],
): DemoNoteSeed[] {
	if (!noteRecords.length) {
		return [];
	}

	const labelCycle = labels.map((label) => label.id);
	const versions = [...assetVersions].sort((a, b) => a.id.localeCompare(b.id));
	const notes: DemoNoteSeed[] = [];
	let noteIndex = 0;

	for (const version of versions) {
		const record = noteRecords[noteIndex % noteRecords.length];
		const recordMap = record as Record<string, unknown>;
		const rawBody = record?.NOTE ?? getField(recordMap, "NOTE", "Note", "note");
		const body = safeTrim(rawBody);
		if (!body) {
			console.warn(
				"[generate-demo-seed] Skipping note assignment due to empty note body",
				record,
			);
			noteIndex += 1;
			continue;
		}
		const authorMatch = body.match(/@([A-Za-z]+\s+[A-Za-z]+)/);
		const author = authorMatch ? `@${authorMatch[1]}` : "Demo Supervisor";
		const baseTimestamp = new Date(version.publishedAt).getTime();
		const createdAt = new Date(
			baseTimestamp + noteIndex * 60 * 1000,
		).toISOString();
		const labelId = labelCycle.length
			? labelCycle[noteIndex % labelCycle.length]
			: undefined;

		notes.push({
			id: stableId("demo:note", `${version.id}:${noteIndex}`),
			versionId: version.id,
			author,
			body,
			createdAt,
			labelId,
		});

		noteIndex += 1;
	}

	return notes;
}

async function writeDemoSeed(payload: DemoSeedPayload, outFile: string) {
	const header = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated via scripts/generate-demo-seed.ts
import type { Playlist } from "@/types";

export interface DemoStatusSeed {
  id: string;
  name: string;
  colorToken: {
    text: string;
    background: string;
    border: string;
  };
}

export interface DemoLabelSeed extends DemoStatusSeed {}

export interface DemoAssetVersionSeed {
  id: string;
  ftrackId: string;
  displayName: string;
  versionNumber: number;
  assetType: string;
  shot: string;
  status: string;
  publishedBy: string;
  publishedAt: string;
  description?: string;
  thumbnailFilename: string;
  movieFilename?: string;
  componentIds: string[];
  shotStatus?: string;
}

export interface DemoPlaylistSeed {
  id: string;
  name: string;
  type: Playlist["type"];
  categoryName?: string;
  categoryId?: string;
  description?: string;
  date?: string;
  versionIds: string[];
}

export interface DemoNoteSeed {
  id: string;
  versionId: string;
  author: string;
  body: string;
  createdAt: string;
  labelId?: string;
}

export interface DemoSeedPayload {
  seedVersion: string;
  project: {
    id: string;
    name: string;
    fullName: string;
  };
  assetVersions: DemoAssetVersionSeed[];
  playlists: DemoPlaylistSeed[];
  notes: DemoNoteSeed[];
  noteLabels: DemoLabelSeed[];
  shotStatuses: DemoStatusSeed[];
  versionStatuses: DemoStatusSeed[];
}

export const demoSeed: DemoSeedPayload = `;

	const json = JSON.stringify(payload, null, 2);
	const fileContents = `${header}${json} as const;\n`;
	await fs.writeFile(outFile, fileContents, "utf8");
}

function resolveInputPath(root: string, relativePath: string): string {
	const resolved = path.resolve(root, relativePath);
	return resolved;
}

async function main() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const projectRoot = path.resolve(__dirname, "..");

	const argv = process.argv.slice(2);
	const cliRootArg = argv.find((arg) => arg.startsWith("--mock-root="));
	const cliMockRoot = cliRootArg
		? cliRootArg.split("=").slice(1).join("=")
		: undefined;

	const mockRoot =
		cliMockRoot?.trim() ||
		process.env.ASTRANOTES_MOCK_ROOT?.trim() ||
		path.join(
			process.env.HOME ?? process.cwd(),
			"Downloads",
			"AstraNotes_MockData",
		);

	const ensureFileExists = async (filePath: string) => {
		try {
			await fs.access(filePath);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error accessing file";
			throw new Error(
				`Required mock data file not found: ${filePath}\n` +
					`Pass a custom directory via --mock-root=... or set ASTRANOTES_MOCK_ROOT.\n` +
					`Underlying error: ${message}`,
			);
		}
	};

	const paths = {
		versions: resolveInputPath(mockRoot, "Mock Version Data.csv"),
		playlists: resolveInputPath(mockRoot, "Playlist Data.csv"),
		labels: resolveInputPath(mockRoot, "Note Label Data.csv"),
		shotStatuses: resolveInputPath(mockRoot, "Shot Status Data.csv"),
		versionStatuses: resolveInputPath(mockRoot, "Version Status Data.csv"),
		notes: resolveInputPath(mockRoot, "Mock Note Data.csv"),
	};

	await Promise.all(
		Object.values(paths).map((filePath) => ensureFileExists(filePath)),
	);

	const [
		versionRecords,
		playlistRecords,
		labelRecords,
		shotStatusRecords,
		versionStatusRecords,
		noteRecords,
	] = await Promise.all([
		parseCsv<VersionCsvRecord>(paths.versions),
		parseCsv<PlaylistCsvRecord>(paths.playlists),
		parseCsv<LabelCsvRecord>(paths.labels),
		parseCsv<StatusCsvRecord>(paths.shotStatuses),
		parseCsv<StatusCsvRecord>(paths.versionStatuses),
		parseCsv<NoteCsvRecord>(paths.notes),
	]);

	const assetVersions = buildAssetVersions(versionRecords);
	const noteLabels = buildLabels(labelRecords);
	const shotStatuses = buildStatuses(shotStatusRecords, "demo:status:shot");
	const versionStatuses = buildStatuses(
		versionStatusRecords,
		"demo:status:version",
	);
	const playlists = buildPlaylists(playlistRecords, assetVersions);
	const notes = buildNotes(noteRecords, assetVersions, noteLabels);

	const seedVersion = new Date().toISOString();

	const payload: DemoSeedPayload = {
		seedVersion,
		project: DEMO_PROJECT,
		assetVersions,
		playlists,
		notes,
		noteLabels,
		shotStatuses,
		versionStatuses,
	};

	const outputPath = path.resolve(projectRoot, "src/services/mock/demoSeed.ts");
	await writeDemoSeed(payload, outputPath);

	console.log(
		`Generated demo seed with ${assetVersions.length} versions, ${playlists.length} playlists, and ${notes.length} notes.`,
	);
	console.log(`Seed written to ${outputPath}`);
}

main().catch((error) => {
	console.error("Failed to generate demo seed:", error);
	process.exitCode = 1;
});
