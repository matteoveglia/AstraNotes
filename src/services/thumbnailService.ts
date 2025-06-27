/**
 * @fileoverview thumbnailService.ts
 * Service for fetching and caching thumbnails from ftrack.
 * Handles CORS issues by using Tauri's HTTP plugin.
 * Includes Suspense-compatible promise-based fetching.
 */

import { fetch } from "@tauri-apps/plugin-http";
import { Session } from "@ftrack/api";
import { useThumbnailSettingsStore } from "../store/thumbnailSettingsStore";
import { ftrackService } from "@/services/ftrack";

// Cache for thumbnail blob URLs (by thumbnailId)
const thumbnailCache = new Map<string, string>();

// Suspense-compatible promise cache
const thumbnailPromiseCache = new Map<string, Promise<string | null>>();

// External update callback for integrating with global cache
let globalCacheUpdateCallback:
  | ((versionId: string, url: string) => void)
  | null = null;

interface ThumbnailOptions {
  size?: number;
}

/**
 * Sets a callback to update external global caches when thumbnails are loaded
 * This allows integration with external global caches (legacy)
 */
export function setGlobalCacheUpdateCallback(
  callback: ((versionId: string, url: string) => void) | null,
): void {
  globalCacheUpdateCallback = callback;
}

/**
 * Creates a cache integration bridge (legacy function - no longer needed with Suspense)
 * @deprecated Use ThumbnailSuspense component instead
 */
export function createCacheIntegration() {
  // No longer needed with Suspense-based thumbnail loading
  console.debug(
    "[ThumbnailService] Cache integration not needed with Suspense",
  );
}

/**
 * Creates a Suspense-compatible thumbnail fetcher
 * Throws a promise if the thumbnail is still loading, returns the URL when ready
 * @param componentId The component ID of the thumbnail
 * @param options Optional thumbnail options
 * @returns The thumbnail URL (throws a promise if still loading)
 */
export function getThumbnailSuspense(
  componentId: string | null | undefined,
  options: ThumbnailOptions = {},
): string | null {
  if (!componentId) {
    return null;
  }

  const { size } = useThumbnailSettingsStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;

  // If we have it in cache, return immediately
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey) || null;
  }

  // If we have a promise in flight, throw it (Suspense will catch it)
  if (thumbnailPromiseCache.has(cacheKey)) {
    throw thumbnailPromiseCache.get(cacheKey);
  }

  // Create and cache the promise (session will be fetched internally)
  const promise = fetchThumbnailPromise(componentId, options);
  thumbnailPromiseCache.set(cacheKey, promise);

  // Handle the promise resolution
  promise
    .then((url) => {
      // Remove from promise cache and add to regular cache
      thumbnailPromiseCache.delete(cacheKey);
      if (url) {
        thumbnailCache.set(cacheKey, url);
      }
    })
    .catch((error) => {
      // Remove from promise cache on error
      thumbnailPromiseCache.delete(cacheKey);
      console.error(`[ThumbnailService] Failed to fetch thumbnail: ${error}`);
    });

  // Throw the promise for Suspense
  throw promise;
}

/**
 * Internal promise-based thumbnail fetcher
 */
async function fetchThumbnailPromise(
  componentId: string,
  options: ThumbnailOptions = {},
): Promise<string | null> {
  try {
    const { size } = useThumbnailSettingsStore.getState();

    // Get ftrack session
    const session = await ftrackService.getSession();

    // Generate the thumbnail URL using the ftrack API
    const thumbnailUrl = session.thumbnailUrl(componentId, {
      size: size || options.size,
    });

    // Use Tauri HTTP plugin to fetch the thumbnail (bypassing CORS)
    const response = await fetch(thumbnailUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch thumbnail: ${response.status} ${response.statusText}`,
      );
    }

    // Get the binary data
    const binaryData = await response.arrayBuffer();

    // Convert binary data to a Blob
    const blob = new Blob([binaryData], { type: "image/jpeg" });

    // Create a blob URL
    const blobUrl = URL.createObjectURL(blob);

    return blobUrl;
  } catch (error) {
    console.error("[ThumbnailSuspense] Failed to fetch thumbnail:", {
      componentId,
      error,
    });
    return null;
  }
}

/**
 * Fetches a thumbnail from ftrack using the Tauri HTTP plugin to avoid CORS issues
 * @param componentId The component ID of the thumbnail
 * @param session The ftrack session
 * @param options Optional thumbnail options
 * @param versionId Optional version ID for global cache integration
 * @returns A blob URL for the thumbnail image
 */
export async function fetchThumbnail(
  componentId: string | null | undefined,
  session: Session,
  options: ThumbnailOptions = {},
  versionId?: string,
): Promise<string | null> {
  if (!componentId) {
    console.debug("[ThumbnailService] No component ID provided");
    return null;
  }

  //console.debug('[ThumbnailService] Received component ID:', componentId);

  // Check cache first
  const { size } = useThumbnailSettingsStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;
  //console.debug('[ThumbnailService] Checking cache for thumbnail ID:', cacheKey);
  if (thumbnailCache.has(cacheKey)) {
    //console.debug('[ThumbnailService] Using cached thumbnail for', componentId);
    const cachedUrl = thumbnailCache.get(cacheKey) || null;

    // Update global cache if we have the versionId
    if (cachedUrl && versionId && globalCacheUpdateCallback) {
      globalCacheUpdateCallback(versionId, cachedUrl);
    }

    return cachedUrl;
  }

  try {
    //console.debug('[ThumbnailService] Fetching thumbnail for', componentId);
    // Generate the thumbnail URL using the ftrack API
    const thumbnailUrl = session.thumbnailUrl(componentId, { size });
    //console.debug('[ThumbnailService] Generated thumbnail URL:', thumbnailUrl);

    // Use Tauri HTTP plugin to fetch the thumbnail (bypassing CORS)
    const response = await fetch(thumbnailUrl);
    //console.debug('[ThumbnailService] Response status:', response.status);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch thumbnail: ${response.status} ${response.statusText}`,
      );
    }

    // Get the binary data
    const binaryData = await response.arrayBuffer();
    //console.debug('[ThumbnailService] Received binary data of length:', binaryData.byteLength);

    // Convert binary data to a Blob
    const blob = new Blob([binaryData], { type: "image/jpeg" });

    // Create a blob URL
    const blobUrl = URL.createObjectURL(blob);
    //console.debug('[ThumbnailService] Created blob URL:', blobUrl);

    // Cache the blob URL
    thumbnailCache.set(cacheKey, blobUrl);

    // Update global cache if we have the versionId
    if (versionId && globalCacheUpdateCallback) {
      globalCacheUpdateCallback(versionId, blobUrl);
    }

    return blobUrl;
  } catch (error) {
    console.error("[ThumbnailService] Failed to fetch thumbnail:", error);
    return null;
  }
}

/**
 * Forces a refresh of a thumbnail, bypassing cache
 * @param componentId The component ID of the thumbnail
 * @param session The ftrack session
 * @param options Optional thumbnail options
 * @param versionId Optional version ID for global cache integration
 * @returns A blob URL for the thumbnail image
 */
export async function forceRefreshThumbnail(
  componentId: string | null | undefined,
  session: Session,
  options: ThumbnailOptions = {},
  versionId?: string,
): Promise<string | null> {
  if (!componentId) {
    console.debug(
      "[ThumbnailService] No component ID provided for force refresh",
    );
    return null;
  }

  const { size } = useThumbnailSettingsStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;

  // Remove from cache first to force refresh
  if (thumbnailCache.has(cacheKey)) {
    const oldUrl = thumbnailCache.get(cacheKey);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
    thumbnailCache.delete(cacheKey);
  }

  // Fetch fresh thumbnail
  return fetchThumbnail(componentId, session, options, versionId);
}

/**
 * Clears the thumbnail cache and revokes all blob URLs
 */
export const clearThumbnailCache = (): void => {
  console.debug("[ThumbnailService] Clearing thumbnail cache");

  // Revoke all blob URLs to prevent memory leaks
  thumbnailCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
      //console.debug('[ThumbnailService] Revoked blob URL:', url);
    } catch (error) {
      console.error("[ThumbnailService] Error revoking blob URL:", error);
    }
  });

  // Clear the cache
  thumbnailCache.clear();
  console.debug("[ThumbnailService] Thumbnail cache cleared");
};

/**
 * Gets the current cache size for debugging
 */
export const getThumbnailCacheSize = (): number => {
  return thumbnailCache.size;
};

/**
 * Gets all cached thumbnail URLs mapped by cache key
 */
export const getCachedThumbnails = (): Map<string, string> => {
  return new Map(thumbnailCache);
};

// For testing purposes only
export const _testing = {
  addToCache: (key: string, url: string) => {
    thumbnailCache.set(key, url);
  },
  clearCache: () => {
    thumbnailCache.clear();
  },
  getCacheSize: () => {
    return thumbnailCache.size;
  },
};
