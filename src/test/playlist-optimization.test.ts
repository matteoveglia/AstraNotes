/**
 * Test suite for playlist optimization implementation
 * Verifies that the consolidated queries and bug fixes work correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../store/db';
import { playlistStore } from '../store/playlist';
import { usePlaylistCreationStore } from '../store/playlistCreationStore';
import type { AssetVersion, CreatePlaylistRequest } from '../types';

describe('Playlist Optimization', () => {
  beforeEach(async () => {
    // Clear database tables before each test
    try {
      await db.transaction('rw', [db.playlists, db.versions, db.localPlaylists, db.localPlaylistVersions, db.attachments], async () => {
        await Promise.all([
          db.playlists.clear(),
          db.versions.clear(),
          db.localPlaylists.clear(),
          db.localPlaylistVersions.clear(),
          db.attachments.clear(),
        ]);
      });
    } catch (error) {
      console.warn('Failed to clear database in test setup:', error);
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await db.transaction('rw', [db.playlists, db.versions, db.localPlaylists, db.localPlaylistVersions, db.attachments], async () => {
        await Promise.all([
          db.playlists.clear(),
          db.versions.clear(),
          db.localPlaylists.clear(),
          db.localPlaylistVersions.clear(),
          db.attachments.clear(),
        ]);
      });
    } catch (error) {
      console.warn('Failed to clear database in test cleanup:', error);
    }
  });

  it('maintains API compatibility', async () => {
    // Test all public methods work identically
    const playlist = await playlistStore.getPlaylist('test-id');
    expect(playlist).toBeNull(); // Should return null for non-existent playlist

    await playlistStore.saveDraft('v1', 'p1', 'content');
    const draft = await playlistStore.getDraftContent('p1', 'v1');
    expect(draft).toBe('content');
  });

  it('creates local playlist with enhanced database model', async () => {
    const request: CreatePlaylistRequest = {
      name: 'Test Playlist',
      type: 'list',
      projectId: 'project-1',
    };

    const versions: AssetVersion[] = [
      {
        id: 'version-1',
        name: 'Test Version 1',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'version-2',
        name: 'Test Version 2',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const { createPlaylist } = usePlaylistCreationStore.getState();
    const playlist = await createPlaylist(request, versions);

    expect(playlist).toBeDefined();
    expect(playlist.id).toMatch(/^local_/);
    expect(playlist.name).toBe('Test Playlist');
    expect(playlist.versions).toHaveLength(2);
    expect(playlist.isLocalOnly).toBe(true);
    expect(playlist.ftrackSyncState).toBe('pending');

    // Verify data was stored in both tables during transition
    const localVersions = await db.localPlaylistVersions
      .where('playlistId').equals(playlist.id)
      .toArray();
    expect(localVersions).toHaveLength(2);

    // Verify enhanced versions table has the data
    const enhancedVersions = await db.versions
      .where('playlistId').equals(playlist.id)
      .and(v => v.isLocalPlaylist === true)
      .toArray();
    expect(enhancedVersions).toHaveLength(2);
    expect(enhancedVersions[0].isLocalPlaylist).toBe(true);
    expect(enhancedVersions[0].localPlaylistAddedAt).toBeDefined();
  });

  it('uses consolidated queries when feature flag is enabled', async () => {
    const playlistId = 'local_test_playlist';
    
    // Create test data in versions table
    const testVersions = [
      {
        id: 'v1',
        playlistId,
        name: 'Version 1',
        version: 1,
        thumbnailUrl: '',
        lastModified: Date.now(),
        labelId: '',
        noteStatus: 'empty' as const,
        addedAt: new Date().toISOString(),
        manuallyAdded: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isLocalPlaylist: true,
        localPlaylistAddedAt: new Date().toISOString(),
      },
      {
        id: 'v2',
        playlistId,
        name: 'Version 2',
        version: 1,
        thumbnailUrl: '',
        lastModified: Date.now(),
        labelId: '',
        noteStatus: 'empty' as const,
        addedAt: new Date().toISOString(),
        manuallyAdded: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isLocalPlaylist: true,
        localPlaylistAddedAt: new Date().toISOString(),
      },
    ];

    await db.versions.bulkAdd(testVersions);

    // Test consolidated query
    const localVersions = await playlistStore.getLocalPlaylistVersions(playlistId);
    expect(localVersions).toHaveLength(2);
    expect(localVersions[0].playlistId).toBe(playlistId);
    expect(localVersions[0].id).toBe('v1');
    expect(localVersions[0].addedAt).toBeDefined();
  });

  it('handles database operations efficiently', async () => {
    const startTime = Date.now();
    
    const request: CreatePlaylistRequest = {
      name: 'Performance Test Playlist',
      type: 'list',
      projectId: 'project-1',
    };

    // Create a larger number of versions to test performance
    const versions: AssetVersion[] = Array.from({ length: 50 }, (_, i) => ({
      id: `version-${i}`,
      name: `Test Version ${i}`,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const { createPlaylist } = usePlaylistCreationStore.getState();
    const playlist = await createPlaylist(request, versions);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(playlist).toBeDefined();
    expect(playlist.versions).toHaveLength(50);
    
    // Should complete within reasonable time (less than 1 second for 50 versions)
    expect(duration).toBeLessThan(1000);
    
    console.log(`Created playlist with 50 versions in ${duration}ms`);
  });

  it('clears manually added flags correctly', async () => {
    const playlistId = 'test-playlist';
    const versionIds = ['v1', 'v2'];

    // Create test versions with manuallyAdded flags
    const testVersions = [
      {
        id: 'v1',
        playlistId,
        name: 'Version 1',
        version: 1,
        thumbnailUrl: '',
        lastModified: Date.now(),
        labelId: '',
        noteStatus: 'empty' as const,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manuallyAdded: true,
      },
      {
        id: 'v2',
        playlistId,
        name: 'Version 2',
        version: 1,
        thumbnailUrl: '',
        lastModified: Date.now(),
        labelId: '',
        noteStatus: 'empty' as const,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manuallyAdded: true,
      },
    ];

    await db.versions.bulkAdd(testVersions);

    // Clear manually added flags
    await playlistStore.clearManuallyAddedFlags(playlistId, versionIds);

    // Verify flags were cleared and syncedAt was set
    const updatedVersions = await db.versions
      .where('playlistId').equals(playlistId)
      .toArray();

    expect(updatedVersions).toHaveLength(2);
    expect(updatedVersions[0].manuallyAdded).toBe(false);
    expect(updatedVersions[0].syncedAt).toBeDefined();
    expect(updatedVersions[1].manuallyAdded).toBe(false);
    expect(updatedVersions[1].syncedAt).toBeDefined();
  });
}); 