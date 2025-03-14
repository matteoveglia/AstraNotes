/**
 * @fileoverview useThumbnailLoading.ts
 * Custom hook for managing thumbnail loading and caching.
 * Handles batch loading, caching, and abort control.
 */

import { useState, useEffect, useRef } from 'react';
import { AssetVersion } from '@/types';
import { ftrackService } from '@/services/ftrack';
import { fetchThumbnail } from '@/services/thumbnailService';

// Global thumbnail cache that persists across component instances
const globalThumbnailCache: Record<string, string> = {};

type LoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export function useThumbnailLoading(versions: AssetVersion[]) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingStatus, setLoadingStatus] = useState<Record<string, LoadingStatus>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true;
    
    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Function to load thumbnails in batches
  const loadThumbnailBatch = async (
    versionsToLoad: AssetVersion[], 
    session: any, 
    abortController: AbortController
  ) => {
    const batchSize = 5; // Number of thumbnails to load at once
    
    for (let i = 0; i < versionsToLoad.length; i += batchSize) {
      // Check if loading should be aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      // Get the next batch
      const batch = versionsToLoad.slice(i, i + batchSize);
      console.debug(`[useThumbnailLoading] Loading thumbnail batch ${i/batchSize + 1}/${Math.ceil(versionsToLoad.length/batchSize)}`);
      
      // Process batch in parallel
      const thumbnailPromises = batch
        .filter(version => version.thumbnailId)
        .map(async (version) => {
          // Skip if already in global cache
          if (globalThumbnailCache[version.id]) {
            return { versionId: version.id, url: globalThumbnailCache[version.id] };
          }
          
          if (!version.thumbnailId) return null;
          
          try {
            setLoadingStatus(prev => ({...prev, [version.id]: 'loading'}));
            
            const url = await fetchThumbnail(version.thumbnailId, session, { size: 512 });
            
            // Add to global cache
            if (url) {
              globalThumbnailCache[version.id] = url;
              return { versionId: version.id, url };
            }
            return null;
          } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.debug(`Thumbnail fetch aborted for version ${version.id}`);
            } else {
              console.error(`Failed to fetch thumbnail for version ${version.id}:`, error);
              setLoadingStatus(prev => ({...prev, [version.id]: 'error'}));
            }
            return null;
          }
        });
      
      try {
        const results = await Promise.all(thumbnailPromises);
        
        // Skip updating state if component unmounted or aborted
        if (!isMountedRef.current || abortController.signal.aborted) return;
        
        // Filter out null results and create a map
        const thumbnailMap = results.reduce((acc, result) => {
          if (result && result.url) {
            acc[result.versionId] = result.url;
            // Update loading status
            setLoadingStatus(prev => ({...prev, [result.versionId]: 'loaded'}));
          }
          return acc;
        }, {} as Record<string, string>);
        
        // Update the state with new thumbnails
        setThumbnails(prev => ({ ...prev, ...thumbnailMap }));
      } catch (error: unknown) {
        console.error("Failed to load thumbnail batch:", error);
      }
      
      // Small delay between batches to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  // Load thumbnails when versions change
  useEffect(() => {
    const loadThumbnails = async () => {
      if (!versions?.length) return;
      
      // Cancel any ongoing thumbnail loading
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller for this loading session
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      // Check if we already have thumbnails for these versions
      const versionsWithThumbnails = versions.filter(
        version => version.thumbnailId
      );
      
      // Apply any thumbnails from global cache immediately
      const cachedThumbnails: Record<string, string> = {};
      versionsWithThumbnails.forEach(version => {
        if (globalThumbnailCache[version.id]) {
          cachedThumbnails[version.id] = globalThumbnailCache[version.id];
          setLoadingStatus(prev => ({...prev, [version.id]: 'loaded'}));
        }
      });
      
      // Update state with cached thumbnails
      if (Object.keys(cachedThumbnails).length > 0) {
        setThumbnails(prev => ({ ...prev, ...cachedThumbnails }));
      }
      
      // Find versions that need thumbnails loaded
      const versionsToLoad = versionsWithThumbnails.filter(
        version => !globalThumbnailCache[version.id]
      );
      
      if (versionsToLoad.length === 0) {
        console.debug('[useThumbnailLoading] All thumbnails already in global cache, skipping load');
        return;
      }
      
      console.debug(`[useThumbnailLoading] Loading thumbnails for ${versionsToLoad.length} versions`);
      
      try {
        const session = await ftrackService.getSession();
        
        // Load thumbnails in batches
        await loadThumbnailBatch(versionsToLoad, session, abortController);
        
        console.debug('[useThumbnailLoading] Finished loading all thumbnails');
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.debug('Thumbnail loading was aborted');
        } else {
          console.error("Failed to load thumbnails:", error);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    };
    
    loadThumbnails();
  }, [versions]);

  return {
    thumbnails,
    loadingStatus,
    isLoading: Object.values(loadingStatus).some(status => status === 'loading'),
    clearThumbnails: () => {
      setThumbnails({});
      setLoadingStatus({});
    }
  };
}
