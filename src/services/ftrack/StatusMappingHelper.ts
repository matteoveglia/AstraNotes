/**
 * @fileoverview StatusMappingHelper.ts
 * Utility functions for handling status mapping and workflow schema logic.
 * Extracted from the legacy ftrack monolith service.
 */

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface WorkflowSchemaData {
  allStatuses: Status[];
  allObjectTypes: any[];
  allWorkflowSchemas: any[];
  allProjectSchemas: any[];
  allSchemas: any[];
  allSchemaStatuses: any[];
}

/**
 * Helper class for status mapping operations
 */
export class StatusMappingHelper {
  private static schemaStatusMapping: {
    [projectSchemaId: string]: {
      [objectTypeName: string]: Status[];
    };
  } = {};

  private static schemaStatusMappingReady = false;
  private static allWorkflowSchemas: any[] = [];

  /**
   * Fetch shared status data from ftrack
   */
  static async fetchSharedStatusData(session: any): Promise<WorkflowSchemaData> {
    console.debug("[StatusMappingHelper] Fetching shared status data");

    try {
      const [
        statusResult,
        objectTypeResult,
        workflowSchemaResult,
        projectSchemaResult,
        schemaResult,
        schemaStatusResult,
      ] = await Promise.all([
        session.query("select id, name, color from Status"),
        session.query("select id, name from ObjectType"),
        session.query("select id, name from WorkflowSchema"),
        session.query("select id from ProjectSchema"),
        session.query("select id, name from Schema"),
        session.query("select id, schema_id, status_id from SchemaStatus"),
      ]);

      return {
        allStatuses: statusResult?.data || [],
        allObjectTypes: objectTypeResult?.data || [],
        allWorkflowSchemas: workflowSchemaResult?.data || [],
        allProjectSchemas: projectSchemaResult?.data || [],
        allSchemas: schemaResult?.data || [],
        allSchemaStatuses: schemaStatusResult?.data || [],
      };
    } catch (error) {
      console.error("[StatusMappingHelper] Failed to fetch shared data:", error);
      throw error;
    }
  }

  /**
   * Build schema status mapping from shared data
   */
  static async buildSchemaStatusMapping(
    session: any,
    sharedData: WorkflowSchemaData,
  ): Promise<void> {
    console.debug("[StatusMappingHelper] Building schema status mapping");

    try {
      const { allStatuses, allObjectTypes, allProjectSchemas } = sharedData;

      for (const projectSchema of allProjectSchemas) {
        const projectSchemaId = projectSchema.id;
        this.schemaStatusMapping[projectSchemaId] = {};

        // Fetch the project schema details with workflow schemas
        const projectSchemaDetailQuery = await session.query(
          `select 
            asset_version_workflow_schema_id,
            task_workflow_schema_id,
            task_workflow_schema_overrides.type_id,
            task_workflow_schema_overrides.workflow_schema_id
          from ProjectSchema 
          where id is "${projectSchemaId}"`,
        );

        if (!projectSchemaDetailQuery?.data?.[0]) {
          console.warn(
            `[StatusMappingHelper] No details found for project schema ${projectSchemaId}`,
          );
          continue;
        }

        const projectSchemaDetail = projectSchemaDetailQuery.data[0];

        // Map AssetVersion statuses
        if (projectSchemaDetail.asset_version_workflow_schema_id) {
          const assetVersionStatuses = await this.getStatusesForWorkflowSchema(
            session,
            projectSchemaDetail.asset_version_workflow_schema_id,
            allStatuses,
          );
          this.schemaStatusMapping[projectSchemaId]["AssetVersion"] =
            assetVersionStatuses;
        }

        // Map Task statuses
        if (projectSchemaDetail.task_workflow_schema_id) {
          const taskStatuses = await this.getStatusesForWorkflowSchema(
            session,
            projectSchemaDetail.task_workflow_schema_id,
            allStatuses,
          );
          this.schemaStatusMapping[projectSchemaId]["Task"] = taskStatuses;
        }

        // Map object type overrides
        const overrides = projectSchemaDetail.task_workflow_schema_overrides;
        if (overrides && Array.isArray(overrides)) {
          for (const override of overrides) {
            if (override.type_id && override.workflow_schema_id) {
              const objectType = allObjectTypes.find(
                (ot: any) => ot.id === override.type_id,
              );
              if (objectType) {
                const overrideStatuses = await this.getStatusesForWorkflowSchema(
                  session,
                  override.workflow_schema_id,
                  allStatuses,
                );
                this.schemaStatusMapping[projectSchemaId][objectType.name] =
                  overrideStatuses;
              }
            }
          }
        }
      }

      this.schemaStatusMappingReady = true;
      console.debug(
        "[StatusMappingHelper] Schema status mapping completed",
        this.schemaStatusMapping,
      );
    } catch (error) {
      console.error(
        "[StatusMappingHelper] Failed to build schema status mapping:",
        error,
      );
      throw error;
    }
  }

  /**
   * Get statuses for a specific workflow schema
   */
  private static async getStatusesForWorkflowSchema(
    session: any,
    workflowSchemaId: string,
    allStatuses: Status[],
  ): Promise<Status[]> {
    try {
      const workflowSchemaQuery = await session.query(
        `select statuses.id, statuses.name, statuses.color
        from WorkflowSchema
        where id is "${workflowSchemaId}"`,
      );

      if (!workflowSchemaQuery?.data?.[0]?.statuses) {
        return [];
      }

      return workflowSchemaQuery.data[0].statuses.map((status: any) => ({
        id: status.id,
        name: status.name,
        color: status.color,
      }));
    } catch (error) {
      console.error(
        `[StatusMappingHelper] Failed to get statuses for workflow schema ${workflowSchemaId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Ensure status mappings are initialized
   */
  static async ensureStatusMappingsInitialized(session: any): Promise<void> {
    if (this.schemaStatusMappingReady) {
      return;
    }

    console.debug("[StatusMappingHelper] Initializing status mappings");
    const sharedData = await this.fetchSharedStatusData(session);
    await this.buildSchemaStatusMapping(session, sharedData);
  }

  /**
   * Get statuses for an object type using the cached mapping
   */
  static async getStatusesForObjectType(
    session: any,
    objectTypeName: string,
  ): Promise<Status[]> {
    await this.ensureStatusMappingsInitialized(session);

    console.debug(
      `[StatusMappingHelper] Getting statuses for object type: ${objectTypeName}`,
    );

    // Find statuses across all project schemas for this object type
    const allStatuses: Status[] = [];
    const seenStatusIds = new Set<string>();

    for (const projectSchemaId in this.schemaStatusMapping) {
      const projectMapping = this.schemaStatusMapping[projectSchemaId];
      if (projectMapping[objectTypeName]) {
        for (const status of projectMapping[objectTypeName]) {
          if (!seenStatusIds.has(status.id)) {
            allStatuses.push(status);
            seenStatusIds.add(status.id);
          }
        }
      }
    }

    console.debug(
      `[StatusMappingHelper] Found ${allStatuses.length} statuses for ${objectTypeName}`,
    );
    return allStatuses;
  }

  /**
   * Clear the cached mappings (useful for testing or forced refresh)
   */
  static clearCache(): void {
    this.schemaStatusMapping = {};
    this.schemaStatusMappingReady = false;
    this.allWorkflowSchemas = [];
    console.debug("[StatusMappingHelper] Cache cleared");
  }
} 