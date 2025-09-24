/**
 * @fileoverview relatedVersionsService.ts
 * Service for handling related versions functionality.
 * Features include shot name extraction and fetching related versions by shot.
 */

import { AssetVersion } from "@/types";
import { ftrackVersionService } from "./ftrack/FtrackVersionService";
import { ftrackStatusService } from "./ftrack/FtrackStatusService";
import { debugLog } from "@/lib/verboseLogging";

export interface VersionStatus {
  id: string;
  name: string;
  color?: string;
}

export interface ShotStatus {
  id: string;
  name: string;
  color?: string;
}

export interface VersionDetails {
  id: string;
  assetName: string;
  versionNumber: number;
  description?: string;
  assetType?: string;
  publishedBy?: string;
  publishedAt?: string;
}

export interface RelatedVersionsService {
  extractShotName(versionName: string): string;
  fetchVersionsByShotName(shotName: string): Promise<AssetVersion[]>;
  batchFetchVersionStatuses(
    versionIds: string[],
  ): Promise<Record<string, VersionStatus>>;
  batchFetchShotStatuses(
    versionIds: string[],
  ): Promise<Record<string, ShotStatus>>;
  batchFetchVersionDetails(
    versionIds: string[],
  ): Promise<Record<string, VersionDetails>>;
  fetchAllVersionStatuses(versionId: string): Promise<VersionStatus[]>;
  fetchAllShotStatuses(shotId: string): Promise<ShotStatus[]>;
}

class RelatedVersionsServiceImpl implements RelatedVersionsService {
  /**
   * Extract shot name from version name
   * Examples:
   * - "ASE0110_comp_000000_GMK" -> "ASE0110"
   * - "SQ010_SH020_layout_v001" -> "SQ010_SH020"
   * - "shot_010_lighting_v003" -> "shot_010"
   */
  extractShotName(versionName: string): string {
    debugLog("[RelatedVersionsService] Extracting shot name from:", versionName);

    // Handle common naming patterns
    // Pattern 1: ASE0110_comp_000000_GMK -> ASE0110
    // Pattern 2: SQ010_SH020_layout_v001 -> SQ010_SH020
    // Pattern 3: shot_010_lighting_v003 -> shot_010

    // Split by underscore and look for shot patterns
    const parts = versionName.split("_");

    if (parts.length === 0) {
      debugLog("[RelatedVersionsService] No underscores found, returning full name");
      return versionName;
    }

    // Common patterns:
    // 1. If first part looks like shot code (ASE, SQ, etc.), use it
    // 2. If we have SQ###_SH### pattern, use both parts
    // 3. If we have shot_### pattern, use first two parts
    // 4. Default: use first part

    const firstPart = parts[0];
    const secondPart = parts[1];

    // Pattern: SQ###_SH### (sequence and shot)
    if (firstPart.match(/^SQ\d+$/i) && secondPart?.match(/^SH\d+$/i)) {
      const shotName = `${firstPart}_${secondPart}`;
      debugLog("[RelatedVersionsService] Detected SQ_SH pattern:", shotName);
      return shotName;
    }

    // Pattern: shot_###
    if (firstPart.toLowerCase() === "shot" && secondPart?.match(/^\d+$/)) {
      const shotName = `${firstPart}_${secondPart}`;
      debugLog("[RelatedVersionsService] Detected shot_number pattern:", shotName);
      return shotName;
    }

    // Pattern: ASE###, sequence codes, etc. (single part shot codes)
    if (firstPart.match(/^[A-Z]{2,4}\d+$/i)) {
      debugLog("[RelatedVersionsService] Detected shot code pattern:", firstPart);
      return firstPart;
    }

    // Default: use first part
    debugLog("[RelatedVersionsService] Using default first part:", firstPart);
    return firstPart;
  }

  /**
   * Fetch all versions for a given shot name
   */
  async fetchVersionsByShotName(shotName: string): Promise<AssetVersion[]> {
    console.debug(
      "[RelatedVersionsService] Fetching versions for shot:",
      shotName,
    );

    try {
      // Use the existing search functionality to find versions matching the shot name
      const versions = await ftrackVersionService.searchVersions({
        searchTerm: shotName,
        limit: 1000, // Get a large number to capture all related versions
      });

      // Filter to only include versions that actually belong to this shot
      const relatedVersions = versions.filter((version) => {
        const extractedShot = this.extractShotName(version.name);
        return extractedShot === shotName;
      });

      console.debug(
        `[RelatedVersionsService] Found ${relatedVersions.length} related versions for shot ${shotName}`,
      );
      return relatedVersions;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to fetch versions for shot:",
        shotName,
        error,
      );
      throw error;
    }
  }

  /**
   * Batch fetch status data for multiple versions
   */
  async batchFetchVersionStatuses(
    versionIds: string[],
  ): Promise<Record<string, VersionStatus>> {
    console.debug(
      "[RelatedVersionsService] Batch fetching statuses for",
      versionIds.length,
      "versions",
    );

    try {
      const statuses: Record<string, VersionStatus> = {};

      // Concurrency-limited fetches to speed up overall time while avoiding overload
      const limit = 6;
      const queue: Promise<void>[] = [];
      let idx = 0;
      const runNext = async () => {
        const i = idx++;
        if (i >= versionIds.length) return;
        const versionId = versionIds[i];
        try {
          console.debug(
            `[RelatedVersionsService] Fetching status for version: ${versionId}`,
          );
          const statusData =
            await ftrackStatusService.fetchStatusPanelData(versionId);
          if (statusData && statusData.versionStatusId) {
            const allStatuses = await ftrackStatusService.getStatusesForEntity(
              "AssetVersion",
              versionId,
            );
            const statusObj = allStatuses.find(
              (s) => s.id === statusData.versionStatusId,
            );
            if (statusObj) {
              statuses[versionId] = statusObj;
            } else {
              console.warn(
                `[RelatedVersionsService] Status object not found for ${versionId} with ID ${statusData.versionStatusId}`,
              );
            }
          } else {
            console.warn(
              `[RelatedVersionsService] No version status ID for ${versionId}`,
            );
          }
        } catch (error) {
          console.warn(
            "[RelatedVersionsService] Failed to fetch status for version:",
            versionId,
            error,
          );
        } finally {
          await runNext();
        }
      };

      // Prime the pool
      for (let i = 0; i < Math.min(limit, versionIds.length); i++) {
        queue.push(runNext());
      }
      await Promise.all(queue);

      console.debug(
        `[RelatedVersionsService] Returning ${Object.keys(statuses).length} version statuses`,
        statuses,
      );
      return statuses;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to batch fetch version statuses:",
        error,
      );
      throw error;
    }
  }

  /**
   * Batch fetch shot/parent status data for multiple versions
   */
  async batchFetchShotStatuses(
    versionIds: string[],
  ): Promise<Record<string, ShotStatus>> {
    console.debug(
      "[RelatedVersionsService] Batch fetching shot statuses for",
      versionIds.length,
      "versions",
    );

    try {
      const statuses: Record<string, ShotStatus> = {};

      const limit = 6;
      const queue: Promise<void>[] = [];
      let idx = 0;
      const runNext = async () => {
        const i = idx++;
        if (i >= versionIds.length) return;
        const versionId = versionIds[i];
        try {
          console.debug(
            `[RelatedVersionsService] Fetching shot status for version: ${versionId}`,
          );
          const statusData =
            await ftrackStatusService.fetchStatusPanelData(versionId);
          if (
            statusData &&
            statusData.parentStatusId &&
            statusData.parentType &&
            statusData.parentId
          ) {
            const allStatuses = await ftrackStatusService.getStatusesForEntity(
              statusData.parentType,
              statusData.parentId,
            );
            const statusObj = allStatuses.find(
              (s) => s.id === statusData.parentStatusId,
            );
            if (statusObj) {
              statuses[versionId] = statusObj;
            } else {
              console.warn(
                `[RelatedVersionsService] Shot status object not found for ${versionId} with ID ${statusData.parentStatusId}`,
              );
            }
          } else {
            console.warn(
              `[RelatedVersionsService] Missing shot status data for ${versionId}:`,
              {
                hasParentStatusId: !!statusData?.parentStatusId,
                hasParentType: !!statusData?.parentType,
                hasParentId: !!statusData?.parentId,
              },
            );
          }
        } catch (error) {
          console.warn(
            "[RelatedVersionsService] Failed to fetch shot status for version:",
            versionId,
            error,
          );
        } finally {
          await runNext();
        }
      };

      for (let i = 0; i < Math.min(limit, versionIds.length); i++) {
        queue.push(runNext());
      }
      await Promise.all(queue);

      console.debug(
        `[RelatedVersionsService] Returning ${Object.keys(statuses).length} shot statuses`,
        statuses,
      );
      return statuses;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to batch fetch shot statuses:",
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch all possible version statuses from ftrack
   * Note: This requires a specific version ID to get the correct statuses for that project
   */
  async fetchAllVersionStatuses(versionId: string): Promise<VersionStatus[]> {
    console.debug(
      "[RelatedVersionsService] Fetching all version statuses for:",
      versionId,
    );

    try {
      const statuses = await ftrackStatusService.getStatusesForEntity(
        "AssetVersion",
        versionId,
      );
      return statuses;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to fetch version statuses:",
        error,
      );
      return [];
    }
  }

  /**
   * Fetch all possible shot statuses from ftrack
   * Note: This requires a specific shot ID to get the correct statuses for that project
   */
  async fetchAllShotStatuses(shotId: string): Promise<ShotStatus[]> {
    console.debug(
      "[RelatedVersionsService] Fetching all shot statuses for:",
      shotId,
    );

    try {
      const statuses = await ftrackStatusService.getStatusesForEntity(
        "Shot",
        shotId,
      );
      return statuses;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to fetch shot statuses:",
        error,
      );
      return [];
    }
  }

  /**
   * Batch fetch version details for multiple versions
   */
  async batchFetchVersionDetails(
    versionIds: string[],
  ): Promise<Record<string, VersionDetails>> {
    console.debug(
      "[RelatedVersionsService] Batch fetching version details for",
      versionIds.length,
      "versions",
    );

    try {
      const details: Record<string, VersionDetails> = {};

      // For now, fetch details individually
      // TODO: Optimize with true batch API calls when available
      for (const versionId of versionIds) {
        try {
          const versionDetails =
            await ftrackVersionService.fetchVersionDetails(versionId);
          if (versionDetails) {
            details[versionId] = versionDetails;
          }
        } catch (error) {
          console.warn(
            "[RelatedVersionsService] Failed to fetch details for version:",
            versionId,
            error,
          );
          // Continue with other versions
        }
      }

      return details;
    } catch (error) {
      console.error(
        "[RelatedVersionsService] Failed to batch fetch version details:",
        error,
      );
      throw error;
    }
  }
}

// Export singleton instance
export const relatedVersionsService = new RelatedVersionsServiceImpl();
