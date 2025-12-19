import { BaseFtrackClient } from "./BaseFtrackClient";
import { debugLog } from "@/lib/verboseLogging";
import type { StatusServiceContract } from "@/services/client/types";

interface Status {
	id: string;
	name: string;
	color?: string;
}

interface StatusPanelData {
	versionId: string;
	versionStatusId?: string;
	parentId?: string;
	parentStatusId?: string;
	parentType?: string;
	projectId: string;
}

export class FtrackStatusService
	extends BaseFtrackClient
	implements StatusServiceContract
{
	// Schema status mapping cache - similar to legacy service
	private schemaStatusMapping: {
		[projectSchemaId: string]: {
			[objectTypeName: string]: Status[];
		};
	} = {};

	private schemaStatusMappingReady = false;
	private allWorkflowSchemas: any[] = [];

	// Short-TTL cache and in-flight coalescing for status panel data
	private statusPanelCache = new Map<
		string,
		{ data: StatusPanelData; ts: number }
	>();
	private statusPanelInFlight = new Map<string, Promise<StatusPanelData>>();
	private readonly STATUS_PANEL_TTL_MS = 30 * 1000;

	/**
	 * Fetch all necessary data for the status panel
	 */
	async fetchStatusPanelData(assetVersionId: string): Promise<StatusPanelData> {
		// Serve from cache if fresh
		const now = Date.now();
		const cached = this.statusPanelCache.get(assetVersionId);
		if (cached && now - cached.ts < this.STATUS_PANEL_TTL_MS) {
			return cached.data;
		}

		// Coalesce concurrent requests
		const inFlight = this.statusPanelInFlight.get(assetVersionId);
		if (inFlight) {
			return await inFlight;
		}

		const fetchPromise = (async () => {
			const session = await this.getSession();
			try {
				debugLog(
					"[FtrackStatusService] Fetching status panel data for asset version:",
					assetVersionId,
				);
				// Use the correct relationship path: AssetVersion -> asset.parent
				const query = `select 
        id,
        status_id,
        asset.parent.id,
        asset.parent.name,
        asset.parent.status_id,
        asset.parent.object_type.name,
        asset.parent.project.id
      from AssetVersion 
      where id is "${assetVersionId}"`;

				const result = await session.query(query);
				const version = result.data[0];

				if (!version) {
					throw new Error("Asset version not found");
				}

				const parent = version.asset.parent;

				const data: StatusPanelData = {
					versionId: version.id,
					versionStatusId: version.status_id,
					parentId: parent.id,
					parentStatusId: parent.status_id,
					parentType: parent.object_type.name,
					projectId: parent.project.id,
				};

				// Cache the result
				this.statusPanelCache.set(assetVersionId, { data, ts: now });
				return data;
			} catch (error) {
				console.error(
					`[FtrackStatusService] Failed to fetch status panel data for version ${assetVersionId}:`,
					error,
				);
				throw error;
			} finally {
				this.statusPanelInFlight.delete(assetVersionId);
			}
		})();

		this.statusPanelInFlight.set(assetVersionId, fetchPromise);
		return await fetchPromise;
	}

	/**
	 * Initialize the schema status mapping cache at startup
	 */
	async ensureStatusMappingsInitialized(): Promise<void> {
		if (this.schemaStatusMappingReady) {
			return;
		}

		try {
			debugLog("[FtrackStatusService] Initializing schema status mappings...");

			const session = await this.getSession();

			// Fetch all the data we need in parallel
			const [
				statusesResult,
				objectTypesResult,
				projectSchemasResult,
				schemasResult,
				schemaStatusesResult,
				workflowSchemasResult,
			] = await Promise.all([
				session.query("select id, name, color from Status"),
				session.query("select id, name from ObjectType"),
				session.query(
					"select id, asset_version_workflow_schema_id, task_workflow_schema_id from ProjectSchema",
				),
				session.query(
					"select id, project_schema_id, object_type_id from Schema",
				),
				session.query("select schema_id, status_id from SchemaStatus"),
				session.query(
					"select id, statuses.id, statuses.name, statuses.color from WorkflowSchema",
				),
			]);

			const allStatuses = statusesResult.data || [];
			const allObjectTypes = objectTypesResult.data || [];
			const allProjectSchemas = projectSchemasResult.data || [];
			const allSchemas = schemasResult.data || [];
			const allSchemaStatuses = schemaStatusesResult.data || [];
			const allWorkflowSchemas = workflowSchemasResult.data || [];

			// Store workflow schemas for AssetVersion special handling
			this.allWorkflowSchemas = allWorkflowSchemas;

			// Build the schema status mapping
			this.schemaStatusMapping = {};

			for (const projectSchema of allProjectSchemas) {
				const schemaId = projectSchema.id;
				this.schemaStatusMapping[schemaId] = {};

				// Find all Schema rows for this ProjectSchema
				const schemasForProject = allSchemas.filter(
					(sc: any) => sc.project_schema_id === schemaId,
				);

				for (const schema of schemasForProject) {
					const objectType = allObjectTypes.find(
						(ot: any) => ot.id === schema.object_type_id,
					);
					if (!objectType) continue;

					// Find all SchemaStatus rows for this Schema
					const schemaStatuses = allSchemaStatuses.filter(
						(ss: any) => ss.schema_id === schema.id,
					);

					// Map to Status objects
					const statuses = schemaStatuses
						.map((ss: any) =>
							allStatuses.find((st: any) => st.id === ss.status_id),
						)
						.filter(Boolean) as Status[];

					this.schemaStatusMapping[schemaId][objectType.name] = statuses;
				}
			}

			this.schemaStatusMappingReady = true;
			debugLog(
				"[FtrackStatusService] Schema status mappings initialized successfully",
			);
		} catch (error) {
			console.error(
				"[FtrackStatusService] Failed to initialize schema status mappings:",
				error,
			);
			this.schemaStatusMappingReady = false;
			throw error;
		}
	}

	async fetchApplicableStatuses(
		entityType: string,
		entityId: string,
	): Promise<Status[]> {
		// Ensure mappings are initialized
		await this.ensureStatusMappingsInitialized();

		if (!this.schemaStatusMappingReady) {
			debugLog("[FtrackStatusService] Mapping not ready, returning empty");
			return [];
		}

		try {
			const session = await this.getSession();

			// Get the entity's project and project_schema_id
			const entityQuery = await session.query(
				`select project.id, project.project_schema_id from ${entityType} where id is "${entityId}"`,
			);

			const entityData = entityQuery.data[0];
			if (!entityData) {
				debugLog(
					`[FtrackStatusService] Entity not found: ${entityType} ${entityId}`,
				);
				return [];
			}

			const projectSchemaId = entityData.project?.project_schema_id;
			if (!projectSchemaId) {
				debugLog(
					`[FtrackStatusService] No project_schema_id for entity: ${entityType} ${entityId}`,
				);
				return [];
			}

			// Special handling for AssetVersion (uses workflow schema, not Schema/SchemaStatus)
			if (entityType === "AssetVersion") {
				// Get the ProjectSchema to find asset_version_workflow_schema_id
				const schemaResult = await session.query(
					`select asset_version_workflow_schema_id from ProjectSchema where id is "${projectSchemaId}"`,
				);

				const schema = schemaResult.data[0];
				const workflowSchemaId = schema?.asset_version_workflow_schema_id;

				if (!workflowSchemaId) {
					debugLog(
						`[FtrackStatusService] No asset_version_workflow_schema_id for ProjectSchema ${projectSchemaId}`,
					);
					return [];
				}

				// Find the workflow schema and its statuses
				const workflowSchema = this.allWorkflowSchemas.find(
					(ws: any) => ws.id === workflowSchemaId,
				);

				const statuses =
					workflowSchema?.statuses?.map((s: any) => ({
						id: s.id,
						name: s.name,
						color: s.color,
					})) || [];

				debugLog(
					`[FtrackStatusService] AssetVersion workflow schema ${workflowSchemaId} statuses:`,
					statuses,
				);
				return statuses;
			}

			// For all other entity types, use the pre-built mapping
			const statuses =
				this.schemaStatusMapping[projectSchemaId]?.[entityType] || [];

			debugLog(
				`[FtrackStatusService] Statuses for ${entityType} (${entityId}) in ProjectSchema ${projectSchemaId}:`,
				statuses,
			);
			return statuses;
		} catch (error) {
			debugLog(
				"[FtrackStatusService] Failed to fetch applicable statuses:",
				error,
			);
			throw error;
		}
	}

	async getStatusesForEntity(
		entityType: string,
		entityId: string,
	): Promise<Status[]> {
		// Use fetchApplicableStatuses for proper schema-based status filtering
		return this.fetchApplicableStatuses(entityType, entityId);
	}

	async getStatuses(versionId: string): Promise<Status[]> {
		return this.fetchApplicableStatuses("AssetVersion", versionId);
	}

	async updateEntityStatus(
		entityType: string,
		entityId: string,
		statusId: string,
	): Promise<void> {
		const session = await this.getSession();
		await session.update(entityType, entityId, { status_id: statusId });
		// Invalidate cache when updating an AssetVersion's status
		if (entityType === "AssetVersion") {
			this.statusPanelCache.delete(entityId);
		}
	}
}

export const ftrackStatusService = new FtrackStatusService();
