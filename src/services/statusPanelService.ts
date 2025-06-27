/**
 * @fileoverview statusPanelService.ts
 * Suspense-compatible status panel service that handles caching and promise management.
 * Eliminates manual loading state management in NoteStatusPanel.
 */

import { ftrackService } from "./ftrack";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelData {
  versionId: string;
  versionStatusId: string;
  parentId?: string;
  parentStatusId?: string;
  parentType?: string;
  projectId: string;
}

interface StatusPanelResult {
  currentStatuses: StatusPanelData;
  versionStatuses: Status[];
  parentStatuses: Status[];
}

// Cache for status panel data
const statusPanelCache = new Map<string, StatusPanelResult>();

// Cache for in-flight promises
const statusPanelPromiseCache = new Map<string, Promise<StatusPanelResult>>();

// Cache TTL (30 seconds)
const CACHE_TTL = 30 * 1000;

// Timestamp cache for TTL management
const timestampCache = new Map<string, number>();

/**
 * Creates a cache key for the status panel data
 */
function createCacheKey(assetVersionId: string, parentId?: string): string {
  return `${assetVersionId}:${parentId || "none"}`;
}

/**
 * Suspense-compatible status panel data fetch function
 * Throws a promise if the fetch is still in progress, returns data when ready
 */
export function fetchStatusPanelDataSuspense(
  assetVersionId: string,
): StatusPanelResult {
  if (!assetVersionId) {
    throw new Error("Asset version ID is required");
  }

  // First, we need to fetch the basic status data to determine the cache key
  // This is a bit tricky with Suspense because we need the parentId for the cache key
  // We'll use assetVersionId as the primary key and handle parentId internally

  // Check cache with TTL
  const primaryCacheKey = assetVersionId;
  const cached = statusPanelCache.get(primaryCacheKey);
  const timestamp = timestampCache.get(primaryCacheKey);

  if (cached && timestamp && Date.now() - timestamp < CACHE_TTL) {
    return cached;
  }

  // If fetch is in progress, throw the promise for Suspense
  if (statusPanelPromiseCache.has(primaryCacheKey)) {
    throw statusPanelPromiseCache.get(primaryCacheKey);
  }

  // Create and cache the fetch promise
  const fetchPromise = performFetch(assetVersionId);
  statusPanelPromiseCache.set(primaryCacheKey, fetchPromise);

  // Handle promise resolution
  fetchPromise
    .then((result) => {
      // Cache results and clean up promise cache
      statusPanelCache.set(primaryCacheKey, result);
      timestampCache.set(primaryCacheKey, Date.now());
      statusPanelPromiseCache.delete(primaryCacheKey);
      console.debug(`[StatusPanelService] Cached data for ${assetVersionId}`);
    })
    .catch((error) => {
      // Clean up promise cache on error
      statusPanelPromiseCache.delete(primaryCacheKey);
      console.error(
        `[StatusPanelService] Fetch failed for ${assetVersionId}:`,
        error,
      );
    });

  // Throw promise for Suspense to catch
  throw fetchPromise;
}

/**
 * Performs the actual fetch operation
 */
async function performFetch(
  assetVersionId: string,
): Promise<StatusPanelResult> {
  try {
    // Fetch current status data first
    const currentStatuses =
      await ftrackService.fetchStatusPanelData(assetVersionId);

    // Fetch applicable statuses for version and parent
    const [versionStatuses, parentStatuses] = await Promise.all([
      ftrackService.getStatusesForEntity("AssetVersion", assetVersionId),
      currentStatuses.parentId && currentStatuses.parentType
        ? ftrackService.getStatusesForEntity(
            currentStatuses.parentType,
            currentStatuses.parentId,
          )
        : Promise.resolve([]),
    ]);

    return {
      currentStatuses,
      versionStatuses,
      parentStatuses,
    };
  } catch (error) {
    console.error(
      `[StatusPanelService] Fetch operation failed for ${assetVersionId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Updates entity status and invalidates related cache
 */
export async function updateEntityStatusSuspense(
  entityType: string,
  entityId: string,
  statusId: string,
): Promise<void> {
  try {
    await ftrackService.updateEntityStatus(entityType, entityId, statusId);

    // Invalidate cache for all related entries
    // Since we don't know which assetVersionId this relates to, we'll clear all
    // In a more sophisticated implementation, we could maintain reverse lookup maps
    clearStatusPanelCache();
  } catch (error) {
    console.error(`[StatusPanelService] Status update failed:`, error);
    throw error;
  }
}

/**
 * Clears the cache for a specific version or all versions
 */
export function clearStatusPanelCache(assetVersionId?: string): void {
  if (assetVersionId) {
    statusPanelCache.delete(assetVersionId);
    timestampCache.delete(assetVersionId);
    statusPanelPromiseCache.delete(assetVersionId);
  } else {
    // Clear all cache
    statusPanelCache.clear();
    timestampCache.clear();
    statusPanelPromiseCache.clear();
  }
}

/**
 * Gets current cache size for debugging
 */
export function getStatusPanelCacheSize(): number {
  return statusPanelCache.size;
}
