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

  async getStatusesForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getStatusesForEntity(entityType, entityId);
    }

    // VERY simplified implementation: just return all Statuses sorted.
    // TODO: Implement workflow/schema logic for precise filtering.
    const session = await this.getSession();
    const res = await session.query("select id, name, color, sort from Status order by sort");
    return (res?.data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      color: s.color,
    }));
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