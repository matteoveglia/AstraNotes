/**
 * @fileoverview thumbnailService.ts
 * Service for fetching and caching thumbnails from ftrack.
 * Handles CORS issues by using Tauri's HTTP plugin.
 */

import { fetch } from "@tauri-apps/plugin-http";
import { Session } from "@ftrack/api";
import { useThumbnailSettingsStore } from "../store/thumbnailSettingsStore";

// Cache for thumbnail blob URLs (by thumbnailId)
const thumbnailCache = new Map<string, string>();

// External update callback for integrating with global cache
let globalCacheUpdateCallback:
  | ((versionId: string, url: string) => void)
  | null = null;

interface ThumbnailOptions {
  size?: number;
}

/**
 * Sets a callback to update external global caches when thumbnails are loaded
 * This allows integration with the useThumbnailLoading global cache
 */
export function setGlobalCacheUpdateCallback(
  callback: ((versionId: string, url: string) => void) | null,
): void {
  globalCacheUpdateCallback = callback;
}

/**
 * Creates a cache integration bridge with useThumbnailLoading
 */
export function createCacheIntegration() {
  // Import and setup the callback to update the global cache
  import("@/features/versions/hooks/useThumbnailLoading")
    .then((module) => {
      setGlobalCacheUpdateCallback((versionId: string, url: string) => {
        module.updateGlobalThumbnailCache({ [versionId]: url });
      });
    })
    .catch((error) => {
      console.debug(
        "[ThumbnailService] Could not setup cache integration:",
        error,
      );
    });
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
