/**
 * @fileoverview thumbnailService.ts
 * Service for fetching and caching thumbnails from ftrack.
 * Handles CORS issues by using Tauri's HTTP plugin.
 * Includes Suspense-compatible promise-based fetching.
 */

import { fetch } from "@tauri-apps/plugin-http";
import { Session } from "@ftrack/api";
import { useThumbnailSettingsStore } from "../store/thumbnailSettingsStore";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";
import { useAppModeStore } from "@/store/appModeStore";

// Cache for thumbnail blob URLs (by thumbnailId)
const thumbnailCache = new Map<string, string>();

// Suspense-compatible promise cache
const thumbnailPromiseCache = new Map<string, Promise<string | null>>();

// External update callback for integrating with global cache
let globalCacheUpdateCallback:
  | ((versionId: string, url: string) => void)
  | null = null;

const DEMO_PLACEHOLDER_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%' stop-color='%233361ff'/%3E%3Cstop offset='100%' stop-color='%23099d9d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='225' fill='url(%23g)'/%3E%3Ctext x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, sans-serif' font-size='24' fill='%23ffffff'%3EDemo Thumbnail%3C/text%3E%3C/svg%3E";

type DemoComponentMappings = {
  componentToThumbnail: Map<string, string>;
};

let demoComponentMappingsPromise: Promise<DemoComponentMappings> | null = null;

const demoThumbnailModules = import.meta.glob("../assets/demo/thumbnails/*", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const demoThumbnailMap = new Map<string, string>();

const registerDemoThumbnail = (filename: string, url: string) => {
  const normalized = filename.toLowerCase();
  const variants = [
    normalized,
    normalized.replace(/^\//, ""),
    `thumbnails/${normalized}`,
    `/thumbnails/${normalized}`,
  ];

  for (const variant of variants) {
    if (!demoThumbnailMap.has(variant)) {
      demoThumbnailMap.set(variant, url);
    }
  }
};

Object.entries(demoThumbnailModules).forEach(([path, url]) => {
  const segments = path.split("/");
  const filename = segments[segments.length - 1];
  if (filename) {
    registerDemoThumbnail(filename, url);
  }
});

const resolveDemoThumbnailAsset = (
  filename: string | undefined,
): string | null => {
  if (!filename) {
    return null;
  }

  const normalized = filename.replace(/\\/g, "/").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const direct = demoThumbnailMap.get(normalized);
  if (direct) {
    return direct;
  }

  const basename = normalized.split("/").pop();
  if (basename && demoThumbnailMap.has(basename)) {
    return demoThumbnailMap.get(basename) ?? null;
  }

  return null;
};

const ensureDemoComponentMappings = (): Promise<DemoComponentMappings> => {
  if (!demoComponentMappingsPromise) {
    demoComponentMappingsPromise = import("@/services/mock/demoSeed").then(
      ({ demoSeed }) => {
        const componentToThumbnail = new Map<string, string>();

        for (const version of demoSeed.assetVersions) {
          for (const componentId of version.componentIds) {
            if (!componentToThumbnail.has(componentId)) {
              componentToThumbnail.set(componentId, version.thumbnailFilename);
            }
          }
        }

        return { componentToThumbnail } satisfies DemoComponentMappings;
      },
    );
  }

  return demoComponentMappingsPromise;
};

const resolveDemoThumbnailUrl = async (
  componentId: string,
): Promise<string> => {
  try {
    const { componentToThumbnail } = await ensureDemoComponentMappings();
    const filename = componentToThumbnail.get(componentId);
    const assetUrl = resolveDemoThumbnailAsset(filename ?? undefined);
    if (assetUrl) {
      return assetUrl;
    }
  } catch (error) {
    console.error("[ThumbnailService] Failed to resolve demo thumbnail", {
      componentId,
      error,
    });
  }

  return DEMO_PLACEHOLDER_THUMBNAIL;
};

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
  const { appMode } = useAppModeStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;

  // If we have it in cache, return immediately
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey) || null;
  }

  if (appMode === "demo") {
    if (thumbnailPromiseCache.has(cacheKey)) {
      throw thumbnailPromiseCache.get(cacheKey);
    }

    const promise = resolveDemoThumbnailUrl(componentId)
      .then((url) => {
        thumbnailPromiseCache.delete(cacheKey);
        thumbnailCache.set(cacheKey, url);
        return url;
      })
      .catch((error) => {
        thumbnailPromiseCache.delete(cacheKey);
        console.error("[ThumbnailService] Demo thumbnail resolution failed", {
          componentId,
          error,
        });
        return DEMO_PLACEHOLDER_THUMBNAIL;
      });

    thumbnailPromiseCache.set(cacheKey, promise);
    throw promise;
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
    const { appMode } = useAppModeStore.getState();

    if (appMode === "demo") {
      const url = await resolveDemoThumbnailUrl(componentId);
      return url;
    }

    // Get ftrack session
    const session = await ftrackAuthService.getSession();

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

  // Check cache first
  const { size } = useThumbnailSettingsStore.getState();
  const { appMode } = useAppModeStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;
  if (thumbnailCache.has(cacheKey)) {
    const cachedUrl = thumbnailCache.get(cacheKey) || null;

    // Update global cache if we have the versionId
    if (cachedUrl && versionId && globalCacheUpdateCallback) {
      globalCacheUpdateCallback(versionId, cachedUrl);
    }

    return cachedUrl;
  }

  if (appMode === "demo") {
    try {
      const url = await resolveDemoThumbnailUrl(componentId);
      thumbnailCache.set(cacheKey, url);
      if (versionId && globalCacheUpdateCallback) {
        globalCacheUpdateCallback(versionId, url);
      }
      return url;
    } catch (error) {
      console.error(
        "[ThumbnailService] Failed to resolve demo thumbnail:",
        error,
      );
      return DEMO_PLACEHOLDER_THUMBNAIL;
    }
  }

  try {
    const thumbnailUrl = session.thumbnailUrl(componentId, { size });
    const response = await fetch(thumbnailUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch thumbnail: ${response.status} ${response.statusText}`,
      );
    }

    const binaryData = await response.arrayBuffer();
    const blob = new Blob([binaryData], { type: "image/jpeg" });
    const blobUrl = URL.createObjectURL(blob);

    thumbnailCache.set(cacheKey, blobUrl);

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
  const { appMode } = useAppModeStore.getState();
  const cacheKey = `${componentId}-${size || "default"}`;

  // Remove from cache first to force refresh
  if (thumbnailCache.has(cacheKey)) {
    const oldUrl = thumbnailCache.get(cacheKey);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
    thumbnailCache.delete(cacheKey);
  }

  if (appMode === "demo") {
    const url = await resolveDemoThumbnailUrl(componentId);
    thumbnailCache.set(cacheKey, url);
    return url;
  }

  // Fetch fresh thumbnail in real mode
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
