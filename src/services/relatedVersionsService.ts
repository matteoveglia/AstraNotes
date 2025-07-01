/**
 * @fileoverview relatedVersionsService.ts
 * Service for handling related versions functionality.
 * Features include shot name extraction and fetching related versions by shot.
 */

import { AssetVersion } from "@/types";
import { ftrackService } from "./ftrack";

export interface VersionStatus {
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
  batchFetchVersionStatuses(versionIds: string[]): Promise<Record<string, VersionStatus>>;
  batchFetchVersionDetails(versionIds: string[]): Promise<Record<string, VersionDetails>>;
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
    console.debug("[RelatedVersionsService] Extracting shot name from:", versionName);
    
    // Handle common naming patterns
    // Pattern 1: ASE0110_comp_000000_GMK -> ASE0110
    // Pattern 2: SQ010_SH020_layout_v001 -> SQ010_SH020  
    // Pattern 3: shot_010_lighting_v003 -> shot_010
    
    // Split by underscore and look for shot patterns
    const parts = versionName.split('_');
    
    if (parts.length === 0) {
      console.debug("[RelatedVersionsService] No underscores found, returning full name");
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
      console.debug("[RelatedVersionsService] Detected SQ_SH pattern:", shotName);
      return shotName;
    }
    
    // Pattern: shot_### 
    if (firstPart.toLowerCase() === 'shot' && secondPart?.match(/^\d+$/)) {
      const shotName = `${firstPart}_${secondPart}`;
      console.debug("[RelatedVersionsService] Detected shot_number pattern:", shotName);
      return shotName;
    }
    
    // Pattern: ASE###, sequence codes, etc. (single part shot codes)
    if (firstPart.match(/^[A-Z]{2,4}\d+$/i)) {
      console.debug("[RelatedVersionsService] Detected shot code pattern:", firstPart);
      return firstPart;
    }
    
    // Default: use first part
    console.debug("[RelatedVersionsService] Using default first part:", firstPart);
    return firstPart;
  }

  /**
   * Fetch all versions for a given shot name
   */
  async fetchVersionsByShotName(shotName: string): Promise<AssetVersion[]> {
    console.debug("[RelatedVersionsService] Fetching versions for shot:", shotName);
    
    try {
      // Use the existing search functionality to find versions matching the shot name
      const versions = await ftrackService.searchVersions({
        searchTerm: shotName,
        limit: 1000, // Get a large number to capture all related versions
      });
      
      // Filter to only include versions that actually belong to this shot
      const relatedVersions = versions.filter(version => {
        const extractedShot = this.extractShotName(version.name);
        return extractedShot === shotName;
      });
      
      console.debug(`[RelatedVersionsService] Found ${relatedVersions.length} related versions for shot ${shotName}`);
      return relatedVersions;
      
    } catch (error) {
      console.error("[RelatedVersionsService] Failed to fetch versions for shot:", shotName, error);
      throw error;
    }
  }

  /**
   * Batch fetch status data for multiple versions
   */
  async batchFetchVersionStatuses(versionIds: string[]): Promise<Record<string, VersionStatus>> {
    console.debug("[RelatedVersionsService] Batch fetching statuses for", versionIds.length, "versions");
    
    try {
      const statuses: Record<string, VersionStatus> = {};
      
      // For now, fetch statuses individually
      // TODO: Optimize with true batch API calls when available
      for (const versionId of versionIds) {
        try {
          const statusData = await ftrackService.fetchStatusPanelData(versionId);
          // We'll need to fetch the actual status details
          // This is a placeholder - will be enhanced in later phases
          statuses[versionId] = {
            id: statusData.versionStatusId,
            name: "Unknown", // Will be resolved with proper status lookup
          };
        } catch (error) {
          console.warn("[RelatedVersionsService] Failed to fetch status for version:", versionId, error);
          // Continue with other versions
        }
      }
      
      return statuses;
    } catch (error) {
      console.error("[RelatedVersionsService] Failed to batch fetch version statuses:", error);
      throw error;
    }
  }

  /**
   * Batch fetch version details for multiple versions
   */
  async batchFetchVersionDetails(versionIds: string[]): Promise<Record<string, VersionDetails>> {
    console.debug("[RelatedVersionsService] Batch fetching details for", versionIds.length, "versions");
    
    try {
      const details: Record<string, VersionDetails> = {};
      
      // For now, fetch details individually  
      // TODO: Optimize with true batch API calls when available
      for (const versionId of versionIds) {
        try {
          const versionDetails = await ftrackService.fetchVersionDetails(versionId);
          details[versionId] = versionDetails;
        } catch (error) {
          console.warn("[RelatedVersionsService] Failed to fetch details for version:", versionId, error);
          // Continue with other versions
        }
      }
      
      return details;
    } catch (error) {
      console.error("[RelatedVersionsService] Failed to batch fetch version details:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const relatedVersionsService = new RelatedVersionsServiceImpl(); 