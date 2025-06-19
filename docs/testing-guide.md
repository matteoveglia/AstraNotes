# AstraNotes Testing Guide

> **Comprehensive guide for the AstraNotes testing strategy**  
> For a quick reference to running tests, see [testing-quickref.md](./testing-quickref.md)

## Overview

This document outlines the testing strategy and best practices for the AstraNotes project. The testing suite uses Vitest for logic testing and React Testing Library for React components, with a **strong emphasis on integration testing** for the modular store architecture. The comprehensive testing infrastructure includes full IndexedDB support and realistic test scenarios.

## Testing Philosophy

AstraNotes uses **Integration Testing as the primary approach** for testing the modular store architecture. This approach has proven more effective than isolated unit tests because:

1. **Real-world bug detection**: Integration tests catch data flow issues that unit tests miss
2. **Faster execution**: Integration tests run in ~600ms vs E2E tests taking 10-30 seconds
3. **Better coverage**: Test complete workflows from user action to database persistence
4. **Reduced maintenance**: Less mocking means tests are more resilient to refactoring

## Testing Stack

- **Vitest**: Main test runner for unit and integration tests
- **React Testing Library**: For testing React components
- **@testing-library/user-event**: For simulating user interactions
- **jsdom**: DOM environment in Node.js (changed from happy-dom for IndexedDB support)
- **fake-indexeddb**: Full IndexedDB implementation for testing database operations
- **@vitest/ui**: Visual UI for test results

## Test Directory Structure

```
src/
└── test/
    ├── setup.ts                     # Test setup and configuration (includes fake-indexeddb)
    ├── utils/
    │   └── testHelpers.ts          # Comprehensive test utilities and factories
    ├── components/                  # Component tests
    │   └── Component.test.tsx
    ├── store/                       # Store module tests (prefer integration)
    │   └── store.test.ts
    ├── utils/                       # Utility function tests
    │   └── util.test.ts
    ├── services/                    # Service tests
    │   └── service.test.ts
    └── integration/                 # Integration tests (primary approach)
        ├── CriticalWorkflows.test.tsx      # Comprehensive workflow testing
        ├── PlaylistStoreIntegration.test.tsx # Store integration testing
        └── PlaylistRefreshWorkflow.test.tsx  # Refresh functionality testing
```

## Test Types

### 1. Integration Tests (Primary Approach)

Test complete workflows across multiple store modules and database operations.

**When to use**: 
- Testing modular store architecture (Repository, Cache, Sync, Manager)
- Database operations and data persistence
- Complex business logic workflows
- API integration with external services

**Examples**:
- Complete note creation and publishing workflow
- Playlist refresh functionality preserving manual content
- Draft management across multiple versions
- Cache invalidation and data consistency

### 2. Component Tests

Test individual React components in isolation with mocked dependencies.

**When to use**:
- UI component behavior and rendering
- User interaction handling
- Component prop validation
- Error boundary testing

**Examples**:
- Component rendering with different props
- User interaction flows (click, type, select)
- Form validation and submission
- Loading and error states

### 3. Unit Tests

Test individual functions, utilities, and simple modules in isolation.

**When to use**:
- Pure utility functions
- Data transformation logic
- Simple validation functions
- Mathematical calculations

**Examples**:
- Date formatting utilities
- Data validation functions
- URL parsing and manipulation
- Configuration parsing

### 4. End-to-End Tests (Future)

Test complete user flows and application behavior from start to finish.

**Examples**:
- Full application startup and initialization
- Complete user workflows across multiple screens
- Integration with external systems (ftrack)

## Writing Integration Tests

Integration tests are the **recommended approach** for testing the modular store architecture.

### Integration Test Template

```typescript
// src/test/integration/YourWorkflow.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  TestDataFactory, 
  TestScenarios, 
  TestValidators, 
  TestDatabaseHelpers,
  TestConsoleHelpers,
} from '../utils/testHelpers';
import { playlistStore } from '@/store/playlist';
import { ftrackService } from '@/services/ftrack';

// Mock external services only - not internal store modules
vi.mock('@/services/ftrack', () => ({
  FtrackService: vi.fn().mockImplementation(() => ({
    getPlaylistVersions: vi.fn(),
    createPlaylist: vi.fn(),
    updatePlaylist: vi.fn(),
  })),
  ftrackService: {
    getPlaylistVersions: vi.fn(),
    createPlaylist: vi.fn(),
    updatePlaylist: vi.fn(),
  },
}));

describe('Your Workflow Integration', () => {
  beforeEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
    TestConsoleHelpers.mockConsole();
  });

  afterEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
    TestConsoleHelpers.restoreConsole();
  });

  it('should handle complete workflow', async () => {
    // Setup complex test scenario
    const { playlist, versions } = await TestScenarios.setupFtrackPlaylistWithContent();
    
    // Mock external service response
    const freshVersions = TestDataFactory.createAssetVersions(2, { id: 'fresh-version' });
    vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(freshVersions);
    
    // Execute the workflow
    const result = await playlistStore.refreshPlaylist(playlist.id);
    
    // Validate results
    expect(result.success).toBe(true);
    
    // Validate database consistency
    await TestValidators.validateDatabaseConsistency();
    await TestValidators.validateFtrackMetadata(playlist.id, playlist.ftrackId);
    
    // Verify external service was called correctly
    expect(ftrackService.getPlaylistVersions).toHaveBeenCalledWith(playlist.ftrackId);
  });

  it('should preserve manual content during refresh', async () => {
    // Setup mixed content scenario
    const { playlist, ftrackVersions, manualVersions } = 
      await TestScenarios.setupMixedContentScenario();
    
    // Mock fresh ftrack content (without manual versions)
    const freshFtrackVersions = TestDataFactory.createAssetVersions(1, { id: 'fresh-version' });
    vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(freshFtrackVersions);
    
    // Execute refresh
    await playlistStore.refreshPlaylist(playlist.id);
    
    // Verify manual versions are preserved
    const updatedPlaylist = await playlistStore.getPlaylist(playlist.id);
    const manualVersionsStillExist = manualVersions.every(v => 
      updatedPlaylist?.versions.some(pv => pv.id === v.id && !pv.isRemoved)
    );
    expect(manualVersionsStillExist).toBe(true);
  });
});
```

### Test Utilities Overview

The `testHelpers.ts` file provides comprehensive utilities for integration testing:

#### TestDataFactory
Creates realistic test data with proper relationships and metadata:

```typescript
// Create playlist entities
const playlist = TestDataFactory.createPlaylistEntity({
  name: 'Custom Name',
  ftrackId: 'ftrack-123'
});

// Create asset versions with proper structure
const versions = TestDataFactory.createAssetVersions(3, {
  assetName: 'Shot_010',
  taskName: 'Animation'
});

// Create complex scenarios
const refreshScenario = TestDataFactory.createRefreshScenario();
```

#### TestScenarios
Sets up complex test states that mirror real application usage:

```typescript
// Setup ftrack playlist with content
const { playlist, versions } = await TestScenarios.setupFtrackPlaylistWithContent();

// Setup refresh scenario with existing and fresh content
const { playlist, freshVersions } = await TestScenarios.setupRefreshScenario();

// Setup mixed content (ftrack + manual versions)
const { playlist, ftrackVersions, manualVersions } = 
  await TestScenarios.setupMixedContentScenario();
```

#### TestValidators
Validates database state and business logic consistency:

```typescript
// Validate overall database consistency
await TestValidators.validateDatabaseConsistency();

// Validate ftrack metadata preservation
await TestValidators.validateFtrackMetadata(playlistId, ftrackId);

// Validate removed versions are marked correctly
await TestValidators.validateRemovedVersions(playlistId, ['version-1']);

// Validate draft content and status
await TestValidators.validateDraftContent(playlistId, versionId, content, status);
```

#### TestDatabaseHelpers
Manages database state and provides debugging information:

```typescript
// Clean database between tests
await TestDatabaseHelpers.clearDatabase();

// Get database statistics for debugging
const stats = await TestDatabaseHelpers.getDatabaseStats();
console.log(`Playlists: ${stats.playlists}, Versions: ${stats.versions}`);
```

## Writing Component Tests

### Component Test Example

```typescript
// Component Test
import { describe, it, expect, vi } from 'vitest';
import { renderWithUserEvent, screen } from '../utils';
import { Component } from './Component';

describe('Component', () => {
  it('should render correctly', () => {
    renderWithUserEvent(<Component prop="value" />);
    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const { user } = renderWithUserEvent(<Component prop="value" />);
    const button = screen.getByRole('button');
    await user.click(button);
    expect(screen.getByText('New text')).toBeInTheDocument();
  });

  it('should handle store events', async () => {
    const mockStore = {
      on: vi.fn(),
      off: vi.fn(),
      someMethod: vi.fn(),
    };
    
    render(<Component store={mockStore} />);
    
    // Simulate store event
    const eventHandler = mockStore.on.mock.calls[0][1];
    eventHandler({ data: 'test' });
    
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});
```

## Writing Store Module Tests

**Important**: For the modular store architecture, **prefer integration tests** over isolated unit tests. However, if you need to test individual modules:

### Repository Test Example

```typescript
// Store Module Test (prefer integration tests)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistRepository } from '@/store/playlist/PlaylistRepository';
import { db } from '@/store/db';

vi.mock('@/store/db');

describe('PlaylistRepository', () => {
  let repository: PlaylistRepository;
  
  beforeEach(() => {
    repository = new PlaylistRepository();
    vi.clearAllMocks();
  });

  it('should create playlist with stable UUID', async () => {
    const entity = TestDataFactory.createPlaylistEntity();
    await repository.createPlaylist(entity);
    
    expect(db.playlists.add).toHaveBeenCalledWith(entity);
  });

  it('should handle compound key queries for versions', async () => {
    const playlistId = 'playlist-123';
    const versionId = 'version-456';
    
    // Remember: versions use compound key [playlistId, versionId]
    await repository.getVersion(playlistId, versionId);
    
    expect(db.versions.get).toHaveBeenCalledWith([playlistId, versionId]);
  });

  it('should handle transaction failures', async () => {
    vi.mocked(db.transaction).mockRejectedValue(new Error('DB Error'));
    
    await expect(repository.deletePlaylist('test-id'))
      .rejects.toThrow('DB Error');
  });
});
```

### Cache Test Example

```typescript
describe('PlaylistCache', () => {
  it('should evict expired entries', () => {
    vi.useFakeTimers();
    
    const cache = new PlaylistCache({ ttl: 100 });
    const playlist = TestDataFactory.createPlaylistEntity();
    
    cache.set(playlist.id, playlist);
    
    // Fast-forward time past TTL
    vi.advanceTimersByTime(150);
    
    expect(cache.get(playlist.id)).toBeNull();
    
    vi.useRealTimers();
  });

  it('should evict LRU entries when at capacity', () => {
    const cache = new PlaylistCache({ maxSize: 2 });
    
    const playlist1 = TestDataFactory.createPlaylistEntity({ id: '1' });
    const playlist2 = TestDataFactory.createPlaylistEntity({ id: '2' });
    const playlist3 = TestDataFactory.createPlaylistEntity({ id: '3' });
    
    cache.set('1', playlist1);
    cache.set('2', playlist2);
    cache.set('3', playlist3); // Should evict '1'
    
    expect(cache.get('1')).toBeNull();
    expect(cache.get('3')).not.toBeNull();
  });
});
```

## Database Testing

### Compound Key Handling

**Critical**: The database uses compound primary keys `[playlistId, versionId]` for versions:

```typescript
// ❌ Wrong - won't work with compound key
const version = await db.versions.get('version-1');

// ✅ Correct - use compound key
const version = await db.versions.get([playlistId, 'version-1']);

// ✅ Correct - query versions for a playlist
const versions = await db.versions.where('[playlistId+id]').between(
  [playlistId, ''], 
  [playlistId, '\uffff']
).toArray();
```

### Database Test Patterns

```typescript
describe('Database Operations', () => {
  beforeEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
  });

  it('should handle version operations with compound keys', async () => {
    const playlist = TestDataFactory.createPlaylistEntity();
    const versions = TestDataFactory.createAssetVersions(2);
    
    // Create playlist and versions
    await playlistStore.createPlaylist({
      name: playlist.name,
      type: playlist.type,
      projectId: playlist.projectId,
    });
    
    // Add versions (they should use compound keys)
    for (const version of versions) {
      await playlistStore.addVersionToPlaylist(playlist.id, version);
    }
    
    // Verify versions exist with compound key
    const dbVersion = await db.versions.get([playlist.id, versions[0].id]);
    expect(dbVersion).toBeDefined();
    expect(dbVersion?.id).toBe(versions[0].id);
    
    // Verify database consistency
    await TestValidators.validateDatabaseConsistency();
  });
});
```

## Mocking Strategies

### Mock External Services Only

```typescript
// ✅ Good - Mock external services
vi.mock('@/services/ftrack', () => ({
  FtrackService: vi.fn().mockImplementation(() => ({
    getPlaylistVersions: vi.fn(),
    createPlaylist: vi.fn(),
  })),
  ftrackService: {
    getPlaylistVersions: vi.fn(),
    createPlaylist: vi.fn(),
  },
}));

// ❌ Avoid - Don't mock internal store modules for integration tests
vi.mock('@/store/playlist/PlaylistRepository'); // Don't do this
```

### Accessing Mocked Methods

```typescript
// Use vi.mocked() to access mock methods with proper typing
vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(mockData);

// Verify mock calls
expect(vi.mocked(ftrackService.getPlaylistVersions))
  .toHaveBeenCalledWith('ftrack-123');
```

### Event-Driven Testing

```typescript
describe('Store Events', () => {
  it('should emit sync-completed event', async () => {
    const eventHandler = vi.fn();
    
    playlistStore.on('sync-completed', eventHandler);
    
    await playlistStore.syncPlaylist('test-id');
    
    expect(eventHandler).toHaveBeenCalledWith({
      playlistId: 'test-id',
      ftrackId: 'ftrack-123'
    });
    
    // Clean up
    playlistStore.off('sync-completed', eventHandler);
  });

  it('should clean up event listeners', () => {
    const handler = vi.fn();
    
    playlistStore.on('test-event', handler);
    playlistStore.removeAllListeners();
    
    playlistStore.emit('test-event');
    expect(handler).not.toHaveBeenCalled();
  });
});
```

## Running Tests

### Available Scripts

- `pnpm test`: Run tests in watch mode
- `pnpm test:run`: Run tests once
- `pnpm test:coverage`: Run tests and generate coverage report
- `pnpm test:ui`: Run tests with interactive UI
- `pnpm test src/test/integration/`: Run all integration tests
- `pnpm test src/test/integration/CriticalWorkflows.test.tsx`: Run specific test suite

### Performance Metrics

- **Integration tests**: ~600ms for comprehensive workflows
- **Component tests**: ~100-200ms per suite
- **Unit tests**: ~50ms per suite
- **Total test suite**: ~1-2 seconds for 40+ tests

### Continuous Integration

Tests are automatically run on pull requests to ensure code quality. The fast execution time makes them suitable for frequent CI runs.

## Test Coverage Goals

Aim for high test coverage in critical parts of the application:

- **Store integration workflows**: 95%+ (critical business logic)
- **Database operations**: 90%+ (data consistency is crucial)
- **UI components**: 80%+ (user-facing functionality)
- **Utilities**: 90%+ (pure functions should be well-tested)
- **Services**: 85%+ (external integrations)

## Debugging Tests

### Common Issues and Solutions

1. **Compound Key Errors**
   ```
   Error: Version not found
   ```
   **Solution**: Use compound key `[playlistId, versionId]` instead of just `versionId`

2. **Mock Hoisting Issues**
   ```
   ReferenceError: Cannot access 'mockVariable' before initialization
   ```
   **Solution**: Define mocks inside the `vi.mock()` factory function

3. **Database State Issues**
   ```
   Error: Expected 2 versions, got 0
   ```
   **Solution**: Ensure `TestDatabaseHelpers.clearDatabase()` is called in beforeEach

4. **Event Listener Leaks**
   ```
   Warning: Possible memory leak detected
   ```
   **Solution**: Clean up event listeners in afterEach or component cleanup

### Debugging Tools

- **Test UI**: `pnpm test:ui` for interactive debugging
- **Database Stats**: `TestDatabaseHelpers.getDatabaseStats()` to inspect data
- **Console Mocking**: `TestConsoleHelpers.mockConsole()` for clean output
- **Debug Logging**: Add `console.log` statements to trace execution

```typescript
it('should debug database state', async () => {
  const stats = await TestDatabaseHelpers.getDatabaseStats();
  console.log('Database state:', stats);
  
  // Your test logic here
  
  const newStats = await TestDatabaseHelpers.getDatabaseStats();
  console.log('Database state after:', newStats);
});
```

## Best Practices

### Integration Testing Best Practices

1. **Test Complete Workflows**: From user action to database persistence
2. **Use Real Database Operations**: fake-indexeddb provides real IndexedDB behavior
3. **Mock External Services Only**: Don't mock internal store modules
4. **Validate Data Consistency**: Use `TestValidators.validateDatabaseConsistency()`
5. **Clean State Between Tests**: Use `TestDatabaseHelpers.clearDatabase()`
6. **Test Error Scenarios**: Network failures, invalid data, edge cases

### Component Testing Best Practices

1. **Test User Behavior**: Focus on what users see and do
2. **Mock Store Dependencies**: Use event-driven mocking for stores
3. **Test Accessibility**: Ensure proper ARIA labels and keyboard navigation
4. **Test Error States**: Loading, error, and empty states
5. **Use Semantic Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`

### General Testing Best Practices

1. **Descriptive Test Names**: "should preserve manual versions during refresh"
2. **Single Responsibility**: Each test should verify one specific behavior
3. **Independent Tests**: Tests should not depend on each other
4. **Fast Execution**: Keep tests under 100ms when possible
5. **Realistic Data**: Use `TestDataFactory` for consistent, realistic test data

## Migration Guide

### From Unit Tests to Integration Tests

If you have existing unit tests that heavily mock store modules:

1. **Identify Workflows**: Group related unit tests into workflow scenarios
2. **Remove Store Mocks**: Replace store mocks with real store instances
3. **Add Database Setup**: Use `TestDatabaseHelpers.clearDatabase()` in setup
4. **Use Test Scenarios**: Replace manual data setup with `TestScenarios`
5. **Add Validation**: Use `TestValidators` to verify end-to-end consistency

### Example Migration

```typescript
// Before: Heavily mocked unit test
it('should add version to playlist', () => {
  const mockRepository = { addVersion: vi.fn() };
  const store = new PlaylistStore(mockRepository);
  
  store.addVersion('playlist-1', mockVersion);
  
  expect(mockRepository.addVersion).toHaveBeenCalled();
});

// After: Integration test
it('should add version to playlist and persist to database', async () => {
  const { playlist } = await TestScenarios.setupFtrackPlaylistWithContent();
  const newVersion = TestDataFactory.createAssetVersions(1)[0];
  
  await playlistStore.addVersionToPlaylist(playlist.id, newVersion);
  
  // Verify in database
  const dbVersion = await db.versions.get([playlist.id, newVersion.id]);
  expect(dbVersion).toBeDefined();
  
  // Verify consistency
  await TestValidators.validateDatabaseConsistency();
});
```

This migration approach provides better test coverage, catches more real-world bugs, and is more maintainable as the codebase evolves.