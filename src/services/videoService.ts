/**
 * @fileoverview videoService.ts
 * Service for handling video-related operations including availability checks and URL generation.
 * Handles caching of video URLs and availability status.
 */

import { ftrackVersionService } from "./ftrack/FtrackVersionService";

interface VideoCache {
  [versionId: string]: {
    url: string;
    lastAccessed: number;
    componentId: string;
  };
}

interface VideoAvailability {
  [versionId: string]: {
    isAvailable: boolean;
    lastChecked: number;
  };
}

class VideoService {
  private cache: VideoCache = {};
  private availability: VideoAvailability = {};
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private readonly AVAILABILITY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if reviewable video is available for a version
   */
  async isVideoAvailable(versionId: string): Promise<boolean> {
    console.log(
      `[VideoService] Checking video availability for version: ${versionId}`,
    );

    // Check cache first
    const cached = this.availability[versionId];
    if (
      cached &&
      Date.now() - cached.lastChecked < this.AVAILABILITY_CACHE_DURATION
    ) {
      console.log(
        `[VideoService] Using cached availability for ${versionId}: ${cached.isAvailable}`,
      );
      return cached.isAvailable;
    }

    try {
      console.log(
        `[VideoService] Fetching components for version: ${versionId}`,
      );
      const components = await ftrackVersionService.getVersionComponents(versionId);

      console.log(
        `[VideoService] Found ${components.length} components for version ${versionId}:`,
        components.map((c: any) => ({ name: c.name, id: c.id })),
      );

      // Try to find the 1080p component first
      let reviewableComponent = components.find(
        (c: any) => c.name === "ftrackreview-mp4-1080",
      );

      // If not found, try the regular mp4 component
      if (!reviewableComponent) {
        reviewableComponent = components.find(
          (c: any) => c.name === "ftrackreview-mp4",
        );
        console.log(
          `[VideoService] ftrackreview-mp4-1080 not found, trying ftrackreview-mp4:`,
          reviewableComponent
            ? `Found: ${reviewableComponent.id}`
            : "Not found",
        );
      } else {
        console.log(
          `[VideoService] Found ftrackreview-mp4-1080 component:`,
          reviewableComponent.id,
        );
      }

      const isAvailable = !!reviewableComponent;

      console.log(
        `[VideoService] Video availability for ${versionId}: ${isAvailable}`,
      );
      if (reviewableComponent) {
        console.log(
          `[VideoService] Using component: ${reviewableComponent.name} (${reviewableComponent.id})`,
        );
      }

      // Cache the result
      this.availability[versionId] = {
        isAvailable,
        lastChecked: Date.now(),
      };

      return isAvailable;
    } catch (error) {
      console.error(
        `[VideoService] Failed to check video availability for ${versionId}:`,
        error,
      );

      // Cache negative result for shorter time on errors
      this.availability[versionId] = {
        isAvailable: false,
        lastChecked: Date.now(),
      };

      return false;
    }
  }

  /**
   * Get video URL for a version
   */
  async getVideoUrl(versionId: string): Promise<string | null> {
    console.log(`[VideoService] Getting video URL for version: ${versionId}`);

    // Check cache first
    const cached = this.cache[versionId];
    if (cached && Date.now() - cached.lastAccessed < this.CACHE_DURATION) {
      cached.lastAccessed = Date.now();
      console.log(`[VideoService] Using cached URL for ${versionId}`);
      return cached.url;
    }

    try {
      console.log(
        `[VideoService] Fetching components for video URL: ${versionId}`,
      );
      const components = await ftrackVersionService.getVersionComponents(versionId);

      // Try to find the 1080p component first
      let reviewableComponent = components.find(
        (c: any) => c.name === "ftrackreview-mp4-1080",
      );

      // If not found, try the regular mp4 component
      if (!reviewableComponent) {
        reviewableComponent = components.find(
          (c: any) => c.name === "ftrackreview-mp4",
        );
        console.log(
          `[VideoService] Using fallback ftrackreview-mp4 component for ${versionId}`,
        );
      } else {
        console.log(
          `[VideoService] Using ftrackreview-mp4-1080 component for ${versionId}`,
        );
      }

      if (!reviewableComponent) {
        console.warn(
          `[VideoService] No reviewable video component found for version ${versionId}`,
        );
        console.warn(
          `[VideoService] Available components:`,
          components.map((c: any) => c.name),
        );
        return null;
      }

      console.log(
        `[VideoService] Getting URL for component: ${reviewableComponent.name} (${reviewableComponent.id})`,
      );
      const url = await ftrackVersionService.getComponentUrl(reviewableComponent.id);

      if (url) {
        console.log(
          `[VideoService] Successfully got video URL for ${versionId}`,
        );
        // Cache the URL
        this.cache[versionId] = {
          url,
          lastAccessed: Date.now(),
          componentId: reviewableComponent.id,
        };

        // Update availability cache
        this.availability[versionId] = {
          isAvailable: true,
          lastChecked: Date.now(),
        };
      } else {
        console.warn(
          `[VideoService] Failed to get URL for component ${reviewableComponent.id}`,
        );
      }

      return url;
    } catch (error) {
      console.error(
        `[VideoService] Failed to get video URL for ${versionId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Clear video cache for cleanup
   */
  clearCache(): void {
    console.log("[VideoService] Clearing video cache");

    // Revoke blob URLs to prevent memory leaks
    Object.values(this.cache).forEach(({ url }) => {
      if (url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn("[VideoService] Failed to revoke blob URL:", url, error);
        }
      }
    });

    this.cache = {};
    this.availability = {};
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();

    Object.entries(this.cache).forEach(([versionId, data]) => {
      if (now - data.lastAccessed > this.CACHE_DURATION) {
        if (data.url.startsWith("blob:")) {
          URL.revokeObjectURL(data.url);
        }
        delete this.cache[versionId];
      }
    });

    Object.entries(this.availability).forEach(([versionId, data]) => {
      if (now - data.lastChecked > this.AVAILABILITY_CACHE_DURATION) {
        delete this.availability[versionId];
      }
    });
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      cachedUrls: Object.keys(this.cache).length,
      availabilityCache: Object.keys(this.availability).length,
      memoryEstimate: Object.values(this.cache).reduce((acc, { url }) => {
        return acc + url.length * 2; // Rough estimate in bytes
      }, 0),
    };
  }
}

export const videoService = new VideoService();
