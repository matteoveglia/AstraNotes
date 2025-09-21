/**
 * @fileoverview versionSearchService.ts
 * Suspense-compatible version search service that handles caching and promise management.
 * Provides better user experience with automatic loading coordination.
 */

import { ftrackVersionService } from "./ftrack/FtrackVersionService";
import type { AssetVersion } from "@/types";

// Cache for search results
const searchCache = new Map<string, AssetVersion[]>();

// Cache for in-flight search promises
const searchPromiseCache = new Map<string, Promise<AssetVersion[]>>();

interface SearchParams {
  searchTerm: string;
  projectId?: string;
}

/**
 * Creates a cache key for search parameters
 */
function createCacheKey(params: SearchParams): string {
  return `${params.searchTerm}:${params.projectId || "all"}`;
}

/**
 * Suspense-compatible version search function
 * Throws a promise if the search is still in progress, returns results when ready
 */
export function searchVersionsSuspense(params: SearchParams): AssetVersion[] {
  const { searchTerm, projectId: _projectId } = params;

  if (!searchTerm.trim()) {
    return [];
  }

  const cacheKey = createCacheKey(params);

  // Return cached results immediately
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  // If search is in progress, throw the promise for Suspense
  if (searchPromiseCache.has(cacheKey)) {
    throw searchPromiseCache.get(cacheKey);
  }

  // Create and cache the search promise
  const searchPromise = performSearch(params);
  searchPromiseCache.set(cacheKey, searchPromise);

  // Handle promise resolution
  searchPromise
    .then((results) => {
      // Cache results and clean up promise cache
      searchCache.set(cacheKey, results);
      searchPromiseCache.delete(cacheKey);
    })
    .catch((error) => {
      // Clean up promise cache on error
      searchPromiseCache.delete(cacheKey);
      console.error("[VersionSearchService] Search failed:", error);
    });

  // Throw promise for Suspense to catch
  throw searchPromise;
}

/**
 * Performs the actual search operation
 */
async function performSearch(params: SearchParams): Promise<AssetVersion[]> {
  const { searchTerm, projectId } = params;

  try {
    // Handle multi-version search (comma-separated)
    if (searchTerm.includes(",")) {
      const versionTerms = searchTerm
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term.length > 0);

      // Search for each version term individually
      const searchPromises = versionTerms.map((term) =>
        ftrackVersionService.searchVersions({
          searchTerm: term,
          projectId,
        }),
      );

      const searchResults = await Promise.all(searchPromises);

      // Combine and deduplicate results
      const combinedResults = searchResults.flat();
      const uniqueResults = combinedResults.filter(
        (version, index, self) =>
          index === self.findIndex((v) => v.id === version.id),
      );

      return uniqueResults;
    } else {
      // Regular single search
      return await ftrackVersionService.searchVersions({
        searchTerm,
        projectId,
      });
    }
  } catch (error) {
    console.error("[VersionSearchService] Search operation failed:", error);
    return [];
  }
}

/**
 * Clears the search cache for a specific query or all queries
 */
export function clearSearchCache(
  searchTerm?: string,
  projectId?: string,
): void {
  if (searchTerm !== undefined) {
    const cacheKey = createCacheKey({ searchTerm, projectId });
    searchCache.delete(cacheKey);
    searchPromiseCache.delete(cacheKey);
  } else {
    // Clear all cache
    searchCache.clear();
    searchPromiseCache.clear();
  }
}

/**
 * Gets current cache size for debugging
 */
export function getSearchCacheSize(): number {
  return searchCache.size;
}
