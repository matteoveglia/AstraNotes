import { BaseFtrackClient } from "./BaseFtrackClient";
import { useSettings } from "@/store/settingsStore";

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

export class FtrackStatusService extends BaseFtrackClient {
  /* -------------------------------------------------- */
  /* Helpers                                            */
  /* -------------------------------------------------- */
  private legacy: any | null = null;

  private async getLegacy() {
    if (!this.legacy) {
      const mod = await import("../legacy/ftrack");
      this.legacy = mod.ftrackService;
    }
    return this.legacy;
  }

  private isFallback() {
    return useSettings.getState().settings.useMonolithFallback;
  }

  /* -------------------------------------------------- */
  /* Public API                                         */
  /* -------------------------------------------------- */
  async fetchStatusPanelData(assetVersionId: string): Promise<StatusPanelData> {
    if (this.isFallback()) {
      return (await this.getLegacy()).fetchStatusPanelData(assetVersionId);
    }

    const session = await this.getSession();
    // Query the AssetVersion and its parent shot status info
    const query = `select id, status_id, asset.parent.id, asset.parent.status_id, asset.parent.object_type.name, asset.parent.project.id from AssetVersion where id is "${assetVersionId}"`;
    const result = await session.query(query);
    if (!result?.data?.length) {
      throw new Error("AssetVersion not found");
    }
    const row = result.data[0];
    const parent = row.asset?.parent;
    return {
      versionId: row.id,
      versionStatusId: row.status_id,
      parentId: parent?.id,
      parentStatusId: parent?.status_id,
      parentType: parent?.["object_type.name"] ?? parent?.object_type?.name,
      projectId: parent?.project?.id,
    } as StatusPanelData;
  }

  async fetchApplicableStatuses(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).fetchApplicableStatuses(entityType, entityId);
    }

    try {
      const session = await this.getSession();

      // 1. Get Project Schema ID and Object Type ID (if applicable) from the entity
      console.debug(
        `[fetchApplicableStatuses] entityType: ${entityType}, entityId: ${entityId}`,
      );
      let projection = "project.project_schema_id";
      if (entityType !== "AssetVersion" && entityType !== "Task") {
        projection += ", object_type_id";
      }
      const entityQuery = await session.query(
        `select ${projection} from ${entityType} where id is "${entityId}"`,
      );

      if (!entityQuery.data || entityQuery.data.length === 0) {
        console.debug(
          `[fetchApplicableStatuses] Entity not found: ${entityType} ${entityId}`,
        );
        throw new Error(`Entity ${entityType} with id ${entityId} not found.`);
      }
      const entityData = entityQuery.data[0];
      const schemaId = entityData.project.project_schema_id;
      // CRITICAL FIX: Only access object_type_id if it was included in the projection
      const objectTypeId =
        entityType !== "AssetVersion" && entityType !== "Task"
          ? entityData.object_type_id
          : undefined;
      console.debug(
        `[fetchApplicableStatuses] schemaId: ${schemaId}, objectTypeId: ${objectTypeId}`,
      );

      // 2. Get the Project Schema details, explicitly selecting the overrides relationship
      const schemaQuery = await session.query(
        `select
          asset_version_workflow_schema_id,
          task_workflow_schema_id,
          task_workflow_schema_overrides.type_id,
          task_workflow_schema_overrides.workflow_schema_id
        from ProjectSchema
        where id is "${schemaId}"`,
      );
      console.debug(
        "[fetchApplicableStatuses] Raw ProjectSchema query result:",
        schemaQuery,
      );

      if (!schemaQuery.data?.[0]) {
        console.debug("[fetchApplicableStatuses] Could not find workflow schema");
        throw new Error("Could not find workflow schema");
      }

      const schema = schemaQuery.data[0];
      let workflowSchemaId: string | null = null;

      switch (entityType) {
        case "AssetVersion":
          workflowSchemaId = schema.asset_version_workflow_schema_id;
          break;
        case "Task":
          workflowSchemaId = schema.task_workflow_schema_id;
          break;
        default: {
          console.debug(
            `[fetchApplicableStatuses] Handling default case for entityType: ${entityType}, objectTypeId: ${objectTypeId}`,
          );
          const overrides = schema.task_workflow_schema_overrides;
          console.debug(
            "[fetchApplicableStatuses] Fetched overrides:",
            JSON.stringify(overrides, null, 2),
          );

          if (objectTypeId && overrides && Array.isArray(overrides)) {
            const override = overrides.find(
              (ov: any) => ov && ov.type_id === objectTypeId,
            );
            console.debug(
              `[fetchApplicableStatuses] Searching for override with type_id: ${objectTypeId}`,
            );
            if (override && override.workflow_schema_id) {
              workflowSchemaId = override.workflow_schema_id;
              console.debug(
                `[fetchApplicableStatuses] Override Found! Using workflow override for Object Type ${objectTypeId}: ${workflowSchemaId}`,
              );
            } else {
              console.debug(
                `[fetchApplicableStatuses] No specific override found for type_id: ${objectTypeId} in the fetched overrides.`,
              );
            }
          } else {
            console.debug(
              `[fetchApplicableStatuses] No overrides array found or objectTypeId is missing. Overrides: ${JSON.stringify(overrides)}`,
            );
          }

          if (!workflowSchemaId) {
            workflowSchemaId = schema.task_workflow_schema_id;
            console.debug(
              `[fetchApplicableStatuses] No override applied for ${entityType} (Object Type ${objectTypeId || "N/A"}), using default task workflow: ${workflowSchemaId}`,
            );
          }
          break;
        }
      }

      if (!workflowSchemaId) {
        console.debug(
          `[fetchApplicableStatuses] No workflow schema found for ${entityType}`,
        );
        throw new Error(`No workflow schema found for ${entityType}`);
      }

      // Get the statuses from the workflow schema
      const statusQuery = await session.query(
        `select statuses.id, statuses.name, statuses.color
        from WorkflowSchema
        where id is "${workflowSchemaId}"`,
      );

      console.debug(
        `[fetchApplicableStatuses] statusQuery.data:`,
        JSON.stringify(statusQuery.data, null, 2),
      );
      if (!statusQuery.data?.[0]?.statuses) {
        console.debug(
          `[fetchApplicableStatuses] No statuses found in workflow schema ${workflowSchemaId}`,
        );
        return [];
      }

      console.debug(
        `[fetchApplicableStatuses] Returning statuses for ${entityType} (${entityId}):`,
        statusQuery.data[0].statuses,
      );
      return statusQuery.data[0].statuses.map((status: any) => ({
        id: status.id,
        name: status.name,
        color: status.color,
      }));
    } catch (error) {
      console.debug("Failed to fetch applicable statuses:", error);
      throw error;
    }
  }

  async getStatusesForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getStatusesForEntity(entityType, entityId);
    }

    // Use fetchApplicableStatuses for proper workflow-based status filtering
    return this.fetchApplicableStatuses(entityType, entityId);
  }

  async updateEntityStatus(
    entityType: string,
    entityId: string,
    statusId: string,
  ): Promise<void> {
    if (this.isFallback()) {
      return (await this.getLegacy()).updateEntityStatus(
        entityType,
        entityId,
        statusId,
      );
    }

    const session = await this.getSession();
    await session.update(entityType, entityId, { status_id: statusId });
  }
}

export const ftrackStatusService = new FtrackStatusService();