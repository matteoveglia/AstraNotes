import { ftrackService } from "../ftrack";
import type { AssetVersion } from "@/types";

interface SearchVersionsOptions {
  searchTerm: string;
  limit?: number;
  projectId?: string | null;
}

export class FtrackVersionService {
  /**
   * Searches versions by search term (supports project filtering).
   */
  async searchVersions(
    options: SearchVersionsOptions,
  ): Promise<AssetVersion[]> {
    return ftrackService.searchVersions(options as any);
  }

  /**
   * Fetches the components for a specific AssetVersion (used for download URL, etc.).
   */
  async getVersionComponents(versionId: string) {
    return ftrackService.getVersionComponents(versionId);
  }

  /**
   * Fetches detailed information about an AssetVersion.
   */
  async fetchVersionDetails(assetVersionId: string) {
    return ftrackService.fetchVersionDetails(assetVersionId);
  }

  /**
   * Get URL for a specific component.
   */
  async getComponentUrl(componentId: string): Promise<string | null> {
    return ftrackService.getComponentUrl(componentId);
  }
}

export const ftrackVersionService = new FtrackVersionService(); 