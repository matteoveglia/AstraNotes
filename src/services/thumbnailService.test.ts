import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchThumbnail, clearThumbnailCache } from './thumbnailService';
import { useThumbnailSettingsStore } from '../store/thumbnailSettingsStore';
import type { Mock } from 'vitest';

// Mock the thumbnail settings store
vi.mock('../store/thumbnailSettingsStore', () => ({
  useThumbnailSettingsStore: () => ({
    getState: () => ({ size: 'medium' })
  })
}));

// Mock the Tauri HTTP plugin
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10))
  })
}));

// Mock the global URL object
const mockCreateObjectURL = vi.fn().mockReturnValue('mock-blob-url');
const mockRevokeObjectURL = vi.fn();

interface MockMap<K, V> extends Map<K, V> {
  has: Mock<boolean, [K]>;
  get: Mock<V | undefined, [K]>;
  set: Mock<MockMap<K, V>, [K, V]>;
  forEach: Mock<void, [(value: V, key: K, map: Map<K, V>) => void, this]>;
  clear: Mock<void, []>;
  delete: Mock<boolean, [K]>;
}

const createMockMap = <K, V>(): MockMap<K, V> => {
  const mockMap = new Map<K, V>() as MockMap<K, V>;
  mockMap.has = vi.fn();
  mockMap.get = vi.fn();
  mockMap.set = vi.fn().mockReturnThis();
  mockMap.forEach = vi.fn((callback: (value: V, key: K, map: Map<K, V>) => void) => {
    mockMap.forEach((value, key) => callback(value, key, mockMap));
  });
  mockMap.clear = vi.fn();
  mockMap.delete = vi.fn();
  return mockMap;
};

let mockMap: MockMap<string, string>;

describe('thumbnailService', () => {
  beforeEach(() => {
    // Create a new mock Map instance before each test
    mockMap = createMockMap<string, string>();
    
    // Set up global URL mock
    global.URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    } as unknown as typeof global.URL;
    
    // Mock the global Map constructor to return our mock instance
    vi.spyOn(global, 'Map').mockImplementation(() => mockMap);
    
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchThumbnail', () => {
    it('should return null when component ID is null or undefined', async () => {
      // Test with null
      let result = await fetchThumbnail(null, {} as any);
      expect(result).toBeNull();
      
      // Test with undefined
      result = await fetchThumbnail(undefined, {} as any);
      expect(result).toBeNull();
    });
    
    it('should return cached thumbnail if available', async () => {
      // Mock the thumbnailCache.has to return true for our test case
      mockMap.has.mockReturnValueOnce(true);
      mockMap.get.mockReturnValueOnce('mock-blob-url');
      
      // Create mock session with required methods
      const mockSession = {
        thumbnailUrl: vi.fn().mockReturnValue('https://example.com/thumbnail/123'),
        getServerUrl: vi.fn().mockReturnValue('https://example.com'),
        getApiKey: vi.fn().mockReturnValue('api-key'),
        getApiUser: vi.fn().mockReturnValue('api-user')
      };
      
      // Call fetchThumbnail with a component ID
      const result = await fetchThumbnail('test-component-id', mockSession as any);
      
      // Verify we got the cached URL
      expect(result).toBe('mock-blob-url');
      expect(mockSession.thumbnailUrl).not.toHaveBeenCalled();
    });
    
    it('should fetch and cache thumbnail successfully', async () => {
      // Mock the thumbnailCache to not have our key initially
      mockMap.has.mockReturnValueOnce(false);
      
      // Create mock session with required methods
      const mockSession = {
        thumbnailUrl: vi.fn().mockReturnValue('https://example.com/thumbnail/123'),
        getServerUrl: vi.fn().mockReturnValue('https://example.com'),
        getApiKey: vi.fn().mockReturnValue('api-key'),
        getApiUser: vi.fn().mockReturnValue('api-user')
      };
      
      // Call fetchThumbnail
      const result = await fetchThumbnail('test-component-id', mockSession as any);
      
      // Verify the thumbnail was fetched and cached correctly
      expect(mockSession.thumbnailUrl).toHaveBeenCalledWith('test-component-id', { size: 'medium' });
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockMap.set).toHaveBeenCalled();
      expect(result).toBe('mock-blob-url');
    });
    
    it('should handle fetch errors', async () => {
      // Mock the thumbnailCache to not have our key
      mockMap.has.mockReturnValueOnce(false);
      
      // Mock HTTP fetch to throw an error
      const fetchMock = require('@tauri-apps/plugin-http').fetch;
      fetchMock.mockRejectedValueOnce(new Error('Fetch error'));
      
      // Create mock session with required methods
      const mockSession = {
        thumbnailUrl: vi.fn().mockReturnValue('https://example.com/thumbnail/123'),
        getServerUrl: vi.fn().mockReturnValue('https://example.com'),
        getApiKey: vi.fn().mockReturnValue('api-key'),
        getApiUser: vi.fn().mockReturnValue('api-user')
      };
      
      // Call fetchThumbnail
      const result = await fetchThumbnail('test-component-id', mockSession as any);
      
      // Verify error was handled correctly
      expect(result).toBeNull();
      expect(mockSession.thumbnailUrl).toHaveBeenCalled();
    });
  });
  
  describe('clearThumbnailCache', () => {
    it('should clear the thumbnail cache and revoke all blob URLs', () => {
      // Setup mock Map to simulate having cached thumbnails
      mockMap.forEach.mockImplementation((callback) => {
        callback('blob-url-1', 'key1', mockMap);
        callback('blob-url-2', 'key2', mockMap);
      });
      
      // Call clearThumbnailCache
      clearThumbnailCache();
      
      // Verify each URL was revoked and the cache was cleared
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob-url-1');
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob-url-2');
      expect(mockMap.clear).toHaveBeenCalled();
    });
    
    it('should handle errors when revoking blob URLs', () => {
      // Setup mock Map to simulate having cached thumbnails
      mockMap.forEach.mockImplementation((callback) => {
        callback('blob-url-1', 'key1', mockMap);
        callback('blob-url-2', 'key2', mockMap);
      });
      
      // Make revokeObjectURL throw an error for the first call
      mockRevokeObjectURL.mockImplementation(() => {
        throw new Error('Failed to revoke URL');
      });
      
      // Mock console.error to verify it's called
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Call clearThumbnailCache
      clearThumbnailCache();
      
      // Verify the error was handled and other operations continued
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2); 
      expect(mockMap.clear).toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});

const mockFetch = vi.fn();
global.fetch = mockFetch;
