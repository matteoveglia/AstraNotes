/**
 * @fileoverview releaseNotesService.ts
 * Suspense-compatible release notes service that handles caching and promise management.
 * Eliminates complex loading state management in WhatsNewModal.
 */

import { githubService, GitHubRelease } from "./githubService";

// Cache for release data
let cachedRelease: GitHubRelease | null = null;

// Cache for in-flight promise
let releasePromise: Promise<GitHubRelease> | null = null;

// Cache TTL (1 hour)
const CACHE_TTL = 60 * 60 * 1000;

// Last fetch timestamp
let lastFetchedAt: number | null = null;

/**
 * Suspense-compatible release notes fetch function
 * Throws a promise if the fetch is still in progress, returns release data when ready
 */
export function fetchReleaseDataSuspense(): GitHubRelease {
  // Check cache with TTL
  if (
    cachedRelease &&
    lastFetchedAt &&
    Date.now() - lastFetchedAt < CACHE_TTL
  ) {
    console.debug(
      "[ReleaseNotesService] Using fresh cached GitHub release data",
    );
    return cachedRelease;
  }

  // If fetch is in progress, throw the promise for Suspense
  if (releasePromise) {
    throw releasePromise;
  }

  // Create and cache the fetch promise
  releasePromise = performFetch();

  // Handle promise resolution
  releasePromise
    .then((release) => {
      // Cache results and clean up promise cache
      cachedRelease = release;
      lastFetchedAt = Date.now();
      releasePromise = null;
      console.debug("[ReleaseNotesService] Cached latest GitHub release data");
    })
    .catch((error) => {
      // Clean up promise cache on error
      releasePromise = null;
      console.error("[ReleaseNotesService] Fetch failed:", error);

      // If we have stale cached data, use it as fallback
      if (cachedRelease) {
        console.warn(
          "[ReleaseNotesService] Using stale cached data due to fetch error",
        );
        return cachedRelease;
      }

      // Re-throw the error if no cached data available
      throw error;
    });

  // Throw promise for Suspense to catch
  throw releasePromise;
}

/**
 * Performs the actual fetch operation
 */
async function performFetch(): Promise<GitHubRelease> {
  try {
    console.debug("[ReleaseNotesService] Fetching latest GitHub release data");
    return await githubService.getLatestRelease();
  } catch (error) {
    console.error("[ReleaseNotesService] Fetch operation failed:", error);
    throw error;
  }
}

/**
 * Force refresh the release data by clearing cache
 */
export function refreshReleaseData(): void {
  cachedRelease = null;
  lastFetchedAt = null;
  releasePromise = null;
  console.debug(
    "[ReleaseNotesService] Cache cleared, next fetch will be fresh",
  );
}

/**
 * Gets cached release data if available (for non-Suspense usage)
 */
export function getCachedReleaseData(): GitHubRelease | null {
  return cachedRelease;
}

/**
 * Gets cache age in milliseconds (for debugging)
 */
export function getCacheAge(): number | null {
  return lastFetchedAt ? Date.now() - lastFetchedAt : null;
}

/**
 * Check if cache is fresh (within TTL)
 */
export function isCacheFresh(): boolean {
  return !!(
    cachedRelease &&
    lastFetchedAt &&
    Date.now() - lastFetchedAt < CACHE_TTL
  );
}
