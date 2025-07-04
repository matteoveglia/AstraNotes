import { ftrackService } from "../ftrack";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelData {
  versionId: string;
  versionStatusId?: string;
  taskId?: string;
  taskStatusId?: string;
  parentId?: string;
  parentStatusId?: string;
  parentType?: string;
  projectId: string;
}

export class FtrackStatusService {
  async fetchStatusPanelData(assetVersionId: string): Promise<StatusPanelData> {
    return ftrackService.fetchStatusPanelData(assetVersionId);
  }

  async getStatusesForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Status[]> {
    return ftrackService.getStatusesForEntity(entityType, entityId);
  }

  async updateEntityStatus(
    entityType: string,
    entityId: string,
    statusId: string,
  ): Promise<void> {
    return ftrackService.updateEntityStatus(entityType, entityId, statusId);
  }
}

export const ftrackStatusService = new FtrackStatusService(); 