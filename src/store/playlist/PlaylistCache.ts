/**
 * @fileoverview PlaylistCache.ts
 * In-memory cache management for playlists and versions.
 * Handles cache invalidation and memory optimization for stable UUID architecture.
 */

import { PlaylistEntity, VersionEntity, CacheOperations, CacheConfig } from './types';
import { Playlist } from '@/types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  lastAccessed: number;
}

export class PlaylistCache implements CacheOperations {
  private playlistCache = new Map<string, CacheEntry<Playlist>>();
  private versionCache = new Map<string, CacheEntry<VersionEntity[]>>();
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ttl: 5 * 60 * 1000,      // 5 minutes default TTL
      maxEntries: 50,          // 50 playlists max
      cleanupInterval: 60000,  // 1 minute cleanup interval
      ...config
    };
    
    this.startCleanupTimer();
    console.log('[PlaylistCache] Initialized with config:', this.config);
  }
  
  // =================== PLAYLIST CACHING ===================
  
  getPlaylist(id: string): Playlist | null {
    const entry = this.playlistCache.get(id);
    if (!entry || this.isExpired(entry)) {
      this.playlistCache.delete(id);
      return null;
    }
    
    entry.lastAccessed = Date.now();
    console.log(`[PlaylistCache] Cache hit for playlist: ${id}`);
    return entry.data;
  }
  
  setPlaylist(id: string, playlist: Playlist): void {
    this.ensureCacheSize(this.playlistCache);
    this.playlistCache.set(id, {
      data: playlist,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
    
    console.log(`[PlaylistCache] Cached playlist: ${id}`);
  }
  
  // =================== VERSION CACHING ===================
  
  getVersions(playlistId: string): VersionEntity[] | null {
    const entry = this.versionCache.get(playlistId);
    if (!entry || this.isExpired(entry)) {
      this.versionCache.delete(playlistId);
      return null;
    }
    
    entry.lastAccessed = Date.now();
    console.log(`[PlaylistCache] Cache hit for versions: ${playlistId} (${entry.data.length} versions)`);
    return entry.data;
  }
  
  setVersions(playlistId: string, versions: VersionEntity[]): void {
    this.ensureCacheSize(this.versionCache);
    this.versionCache.set(playlistId, {
      data: versions,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
    
    console.log(`[PlaylistCache] Cached ${versions.length} versions for playlist: ${playlistId}`);
  }
  
  // =================== GENERIC CACHE OPERATIONS ===================
  
  get<T>(key: string): T | null {
    // Generic implementation - primarily for playlists
    const playlistEntry = this.playlistCache.get(key);
    if (playlistEntry && !this.isExpired(playlistEntry)) {
      playlistEntry.lastAccessed = Date.now();
      return playlistEntry.data as T;
    }
    
    return null;
  }
  
  set<T>(key: string, value: T): void {
    // Generic implementation - primarily for playlists
    this.setPlaylist(key, value as Playlist);
  }
  
  invalidate(key: string): void {
    const hadPlaylist = this.playlistCache.delete(key);
    const hadVersions = this.versionCache.delete(key);
    
    if (hadPlaylist || hadVersions) {
      console.log(`[PlaylistCache] Invalidated cache for: ${key}`);
    }
  }
  
  // =================== CACHE MANAGEMENT ===================
  
  clear(): void {
    const playlistCount = this.playlistCache.size;
    const versionCount = this.versionCache.size;
    
    this.playlistCache.clear();
    this.versionCache.clear();
    
    console.log(`[PlaylistCache] Cleared cache (${playlistCount} playlists, ${versionCount} version entries)`);
  }
  
  // =================== CACHE STATISTICS ===================
  
  getStats() {
    return {
      playlists: {
        size: this.playlistCache.size,
        entries: Array.from(this.playlistCache.entries()).map(([id, entry]) => ({
          id,
          lastAccessed: entry.lastAccessed,
          age: Date.now() - entry.timestamp,
          expired: this.isExpired(entry)
        }))
      },
      versions: {
        size: this.versionCache.size,
        entries: Array.from(this.versionCache.entries()).map(([id, entry]) => ({
          id,
          count: entry.data.length,
          lastAccessed: entry.lastAccessed,
          age: Date.now() - entry.timestamp,
          expired: this.isExpired(entry)
        }))
      },
      config: this.config
    };
  }
  
  // =================== PRIVATE METHODS ===================
  
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > this.config.ttl;
  }
  
  private ensureCacheSize<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size >= this.config.maxEntries) {
      // Remove least recently used entries (20% of cache)
      const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      const toRemove = Math.floor(this.config.maxEntries * 0.2);
      console.log(`[PlaylistCache] Removing ${toRemove} LRU entries from cache`);
      
      for (let i = 0; i < toRemove; i++) {
        cache.delete(entries[i][0]);
      }
    }
  }
  
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }
  
  private cleanupExpired(): void {
    let removedCount = 0;
    
    // Clean expired playlists
    for (const [key, entry] of this.playlistCache.entries()) {
      if (this.isExpired(entry)) {
        this.playlistCache.delete(key);
        removedCount++;
      }
    }
    
    // Clean expired versions
    for (const [key, entry] of this.versionCache.entries()) {
      if (this.isExpired(entry)) {
        this.versionCache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[PlaylistCache] Cleaned up ${removedCount} expired cache entries`);
    }
  }
  
  // =================== LIFECYCLE ===================
  
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.clear();
    console.log('[PlaylistCache] Destroyed');
  }
} 