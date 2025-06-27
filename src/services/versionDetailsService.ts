/**
 * @fileoverview versionDetailsService.ts
 * Suspense-compatible version details service that handles caching and promise management.
 * Eliminates manual loading state management in VersionDetailsPanel.
 */

import { ftrackService } from "./ftrack";
import { suspensePerformanceMonitor } from "@/utils/suspensePerformance";

interface VersionDetails {
  id: string;
  assetName: string;
  versionNumber: number;
  description?: string;
  assetType?: string;
  publishedBy?: string;
  publishedAt?: string;
}

// Cache for version details
const detailsCache = new Map<string, VersionDetails>();

// Cache for in-flight promises
const detailsPromiseCache = new Map<string, Promise<VersionDetails>>();

// Cache TTL (1 minute)
const CACHE_TTL = 60 * 1000;

// Timestamp cache for TTL management
const timestampCache = new Map<string, number>();

/**
 * Suspense-compatible version details fetch function
 * Throws a promise if the fetch is still in progress, returns details when ready
 */
export function fetchVersionDetailsSuspense(
  assetVersionId: string,
): VersionDetails {
  if (!assetVersionId) {
    throw new Error("Asset version ID is required");
  }

  // Check cache with TTL
  const cached = detailsCache.get(assetVersionId);
  const timestamp = timestampCache.get(assetVersionId);

  if (cached && timestamp && Date.now() - timestamp < CACHE_TTL) {
    suspensePerformanceMonitor.recordCacheHit("VersionDetails", assetVersionId);
    return cached;
  }

  suspensePerformanceMonitor.recordCacheMiss("VersionDetails", assetVersionId);

  // If fetch is in progress, throw the promise for Suspense
  if (detailsPromiseCache.has(assetVersionId)) {
    throw detailsPromiseCache.get(assetVersionId);
  }

  // Create and cache the fetch promise
  const fetchPromise = performFetch(assetVersionId);
  detailsPromiseCache.set(assetVersionId, fetchPromise);

  // Handle promise resolution
  fetchPromise
    .then((details) => {
      // Cache results and clean up promise cache
      detailsCache.set(assetVersionId, details);
      timestampCache.set(assetVersionId, Date.now());
      detailsPromiseCache.delete(assetVersionId);
      console.debug(
        `[VersionDetailsService] Cached details for ${assetVersionId}`,
      );
    })
    .catch((error) => {
      // Clean up promise cache on error
      detailsPromiseCache.delete(assetVersionId);
      console.error(
        `[VersionDetailsService] Fetch failed for ${assetVersionId}:`,
        error,
      );
    });

  // Throw promise for Suspense to catch
  throw fetchPromise;
}

/**
 * Performs the actual fetch operation
 */
async function performFetch(assetVersionId: string): Promise<VersionDetails> {
  const endOperation = suspensePerformanceMonitor.startOperation(
    "VersionDetails",
    "fetch",
  );

  try {
    const result = await ftrackService.fetchVersionDetails(assetVersionId);
    endOperation(); // Record successful fetch time
    return result;
  } catch (error) {
    endOperation(); // Record failed fetch time
    suspensePerformanceMonitor.recordError("VersionDetails", error as Error);
    console.error(
      `[VersionDetailsService] Fetch operation failed for ${assetVersionId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Clears the cache for a specific version or all versions
 */
export function clearVersionDetailsCache(assetVersionId?: string): void {
  if (assetVersionId) {
    detailsCache.delete(assetVersionId);
    timestampCache.delete(assetVersionId);
    detailsPromiseCache.delete(assetVersionId);
  } else {
    // Clear all cache
    detailsCache.clear();
    timestampCache.clear();
    detailsPromiseCache.clear();
  }
}

/**
 * Gets current cache size for debugging
 */
export function getVersionDetailsCacheSize(): number {
  return detailsCache.size;
}
