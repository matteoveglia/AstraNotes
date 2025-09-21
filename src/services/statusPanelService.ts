/**
 * @fileoverview statusPanelService.ts
 * Suspense-compatible status panel service that handles caching and promise management.
 * Eliminates manual loading state management in NoteStatusPanel.
 */

import { ftrackStatusService } from "./ftrack/FtrackStatusService";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelData {
  versionId: string;
  versionStatus: Status | null;
  parentId?: string;
  parentStatusId?: string;
  parentStatus?: Status | null;
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

// Reverse lookup: entity ID -> set of cache keys that depend on it
const entityToCacheKeys = new Map<string, Set<string>>();

/**
 * Creates a cache key for the status panel data
 */
function createCacheKey(assetVersionId: string, parentId?: string): string {
  return `${assetVersionId}:${parentId || "none"}`;
}

/**
 * Registers a cache key as dependent on specific entity IDs
 */
function registerCacheDependency(cacheKey: string, entityIds: string[]): void {
  for (const entityId of entityIds) {
    if (!entityToCacheKeys.has(entityId)) {
      entityToCacheKeys.set(entityId, new Set());
    }
    entityToCacheKeys.get(entityId)!.add(cacheKey);
  }
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

      // Register cache dependencies for smart invalidation
      const entityIds = [result.currentStatuses.versionId];
      if (result.currentStatuses.parentId) {
        entityIds.push(result.currentStatuses.parentId);
      }
      registerCacheDependency(primaryCacheKey, entityIds);

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
    const statusPanelData =
      await ftrackStatusService.fetchStatusPanelData(assetVersionId);

    // Fetch applicable statuses for version and parent
    const [versionStatuses, parentStatuses] = await Promise.all([
      ftrackStatusService.getStatusesForEntity("AssetVersion", assetVersionId),
      statusPanelData.parentId && statusPanelData.parentType
        ? ftrackStatusService.getStatusesForEntity(
            statusPanelData.parentType,
            statusPanelData.parentId,
          )
        : Promise.resolve([]),
    ]);

    // Convert the status IDs to status objects for the interface
    const versionStatus = statusPanelData.versionStatusId
      ? versionStatuses.find((s) => s.id === statusPanelData.versionStatusId) ||
        null
      : null;

    const parentStatus =
      statusPanelData.parentStatusId && parentStatuses.length > 0
        ? parentStatuses.find((s) => s.id === statusPanelData.parentStatusId) ||
          null
        : null;

    const currentStatuses: StatusPanelData = {
      versionId: statusPanelData.versionId,
      versionStatus,
      parentId: statusPanelData.parentId,
      parentStatusId: statusPanelData.parentStatusId,
      parentStatus,
      parentType: statusPanelData.parentType,
      projectId: statusPanelData.projectId,
    };

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
 * Updates entity status with optimistic updates and smart cache invalidation
 */
export async function updateEntityStatusSuspense(
  entityType: string,
  entityId: string,
  statusId: string,
): Promise<void> {
  // Find all cache keys that depend on this entity
  const affectedCacheKeys = entityToCacheKeys.get(entityId) || new Set();

  // Store original cached data for rollback if needed
  const originalCacheEntries = new Map<string, StatusPanelResult>();

  try {
    // Apply optimistic updates to cache first (for immediate UI feedback)
    for (const cacheKey of affectedCacheKeys) {
      const cachedData = statusPanelCache.get(cacheKey);
      if (cachedData) {
        // Store original for potential rollback
        originalCacheEntries.set(cacheKey, { ...cachedData });

        // Apply optimistic update
        const updatedData = { ...cachedData };
        if (updatedData.currentStatuses.versionId === entityId) {
          const newStatus = updatedData.versionStatuses.find(
            (s) => s.id === statusId,
          );
          if (newStatus) {
            updatedData.currentStatuses.versionStatus = newStatus;
          }
        }
        if (updatedData.currentStatuses.parentId === entityId) {
          updatedData.currentStatuses.parentStatusId = statusId;
          const newParentStatus = updatedData.parentStatuses.find(
            (s) => s.id === statusId,
          );
          if (newParentStatus) {
            updatedData.currentStatuses.parentStatus = newParentStatus;
          }
        }

        // Update cache with optimistic data
        statusPanelCache.set(cacheKey, updatedData);
      }
    }

    // Perform the actual server update
    await ftrackStatusService.updateEntityStatus(
      entityType,
      entityId,
      statusId,
    );

    // Server update succeeded - invalidate affected cache entries for fresh data
    // but only the specific ones, not everything
    for (const cacheKey of affectedCacheKeys) {
      statusPanelCache.delete(cacheKey);
      timestampCache.delete(cacheKey);
      statusPanelPromiseCache.delete(cacheKey);
    }

    console.debug(
      `[StatusPanelService] Status updated and cache invalidated for entity ${entityId}`,
    );
  } catch (error) {
    // Server update failed - rollback optimistic updates
    for (const [cacheKey, originalData] of originalCacheEntries) {
      statusPanelCache.set(cacheKey, originalData);
    }

    console.error(
      `[StatusPanelService] Status update failed, rolled back optimistic updates:`,
      error,
    );
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

    // Clean up dependency tracking for this cache key
    for (const [entityId, cacheKeys] of entityToCacheKeys.entries()) {
      cacheKeys.delete(assetVersionId);
      if (cacheKeys.size === 0) {
        entityToCacheKeys.delete(entityId);
      }
    }
  } else {
    // Clear all cache
    statusPanelCache.clear();
    timestampCache.clear();
    statusPanelPromiseCache.clear();
    entityToCacheKeys.clear();
  }
}

/**
 * Gets current cache size for debugging
 */
export function getStatusPanelCacheSize(): number {
  return statusPanelCache.size;
}
