import { demoSeed } from "@/services/mock/demoSeed";
import { tailwindTokenToHex } from "@/services/mock/tailwindColorMap";
import type { StatusServiceContract } from "@/services/client/types";

type StatusWithColor = {
	id: string;
	name: string;
	color: string;
};

const delay = async () =>
	new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));

const assignments = new Map<string, string>();
const shotAssignments = new Map<string, string>();

interface DemoStatusPanelData {
	versionId: string;
	versionStatusId?: string;
	parentId?: string;
	parentStatusId?: string;
	parentType?: string;
	projectId: string;
}

const versionSeedById = new Map(
	demoSeed.assetVersions.map((version) => [version.id, version]),
);

const versionStatuses: StatusWithColor[] = demoSeed.versionStatuses.map(
	(status) => ({
		id: status.id,
		name: status.name,
		color: tailwindTokenToHex(
			status.colorToken?.text ?? status.colorToken?.background,
		),
	}),
);

const shotStatuses: StatusWithColor[] = demoSeed.shotStatuses.map((status) => ({
	id: status.id,
	name: status.name,
	color: tailwindTokenToHex(
		status.colorToken?.text ?? status.colorToken?.background,
	),
}));

const versionStatusById = new Map(
	versionStatuses.map((status) => [status.id, status]),
);
const versionStatusIdByName = new Map(
	versionStatuses.map((status) => [status.name.toLowerCase(), status.id]),
);

const shotStatusById = new Map(
	shotStatuses.map((status) => [status.id, status]),
);
const shotStatusIdByName = new Map(
	shotStatuses.map((status) => [status.name.toLowerCase(), status.id]),
);

const defaultShotStatusByShot = new Map<string, string>();

const normalizeVersionStatusId = (
	value?: string | null,
): string | undefined => {
	if (!value) {
		return undefined;
	}
	if (versionStatusById.has(value)) {
		return value;
	}
	return versionStatusIdByName.get(value.toLowerCase());
};

const normalizeShotStatusId = (value?: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	if (shotStatusById.has(value)) {
		return value;
	}
	return shotStatusIdByName.get(value.toLowerCase());
};

for (const version of demoSeed.assetVersions) {
	const defaultShotStatusId = normalizeShotStatusId(version.shotStatus);
	if (defaultShotStatusId) {
		defaultShotStatusByShot.set(version.shot, defaultShotStatusId);
	}
}

export const mockStatusService: StatusServiceContract = {
	async fetchStatusPanelData(versionId: string): Promise<DemoStatusPanelData> {
		await delay();
		const version = versionSeedById.get(versionId);
		if (!version) {
			throw new Error(`MockStatusService: version ${versionId} not found`);
		}

		const defaultVersionStatusId = normalizeVersionStatusId(version.status);
		const versionStatusId =
			assignments.get(versionId) ?? defaultVersionStatusId;

		const shotStatusId =
			shotAssignments.get(version.shot) ??
			defaultShotStatusByShot.get(version.shot);

		return {
			versionId: version.id,
			versionStatusId,
			parentId: version.shot,
			parentStatusId: shotStatusId,
			parentType: "Shot",
			projectId: demoSeed.project.id,
		} satisfies DemoStatusPanelData;
	},
	async getStatusesForEntity(entityType: string, entityId: string) {
		await delay();

		if (entityType === "AssetVersion") {
			const version = versionSeedById.get(entityId);
			const rawCurrent = assignments.get(entityId) ?? version?.status ?? null;
			const current =
				normalizeVersionStatusId(rawCurrent) ?? rawCurrent ?? null;
			return versionStatuses.map((status) => ({
				...status,
				isCurrent: current === status.id,
			}));
		}

		if (entityType === "Shot") {
			const rawCurrent =
				shotAssignments.get(entityId) ??
				defaultShotStatusByShot.get(entityId) ??
				null;
			const current = normalizeShotStatusId(rawCurrent) ?? rawCurrent ?? null;
			return shotStatuses.map((status) => ({
				...status,
				isCurrent: current === status.id,
			}));
		}

		return [];
	},
	async updateEntityStatus(
		entityType: string,
		entityId: string,
		statusId: string,
	): Promise<void> {
		await delay();
		if (entityType === "AssetVersion") {
			assignments.set(entityId, statusId);
			return;
		}
		if (entityType === "Shot") {
			shotAssignments.set(entityId, statusId);
		}
	},
	async getStatuses(versionId: string) {
		await delay();
		const version = versionSeedById.get(versionId);
		const rawCurrent = assignments.get(versionId) ?? version?.status ?? null;
		const current = normalizeVersionStatusId(rawCurrent) ?? rawCurrent ?? null;
		return versionStatuses.map((status) => ({
			...status,
			isCurrent: current === status.id,
		}));
	},
	async ensureStatusMappingsInitialized() {
		// No-op for mock service to mirror real service interface.
		return Promise.resolve();
	},
};
