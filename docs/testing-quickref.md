# AstraNotes Testing Quick Reference

> **Quick reference guide for testing in AstraNotes**  
> For comprehensive testing guidelines, see [testing-guide.md](./testing-guide.md)

## Running Tests

AstraNotes uses Vitest for testing with full IndexedDB support via fake-indexeddb. The following commands are available:

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Generate coverage reports
pnpm test:coverage

# Run specific test types
pnpm test:component   # Component tests
pnpm test:store       # Zustand store tests
pnpm test:utils       # Utility tests
pnpm test:integration # Integration tests (recommended for store testing)

# Run specific test suites
pnpm test src/test/integration/CriticalWorkflows.test.tsx
pnpm test src/test/integration/PlaylistStoreIntegration.test.tsx
```

## Test Environment

- **Test Runner**: Vitest with jsdom environment
- **Database**: fake-indexeddb for IndexedDB testing
- **Component Testing**: React Testing Library + @testing-library/user-event
- **Mocking**: Vitest mocking system with proper hoisting support

## Test Structure

Tests are organized in the following structure:

- `src/test/` - Test setup and utilities
  - `setup.ts` - Global test setup (includes fake-indexeddb)
  - `utils/testHelpers.ts` - Comprehensive test utilities and factories
  - `components/` - Component tests
  - `store/` - Store module tests (prefer integration tests)
  - `utils/` - Utility function tests
  - `services/` - Service tests
  - `integration/` - **Integration tests (primary testing approach)**
    - `CriticalWorkflows.test.tsx` - Comprehensive workflow testing
    - `PlaylistStoreIntegration.test.tsx` - Store integration testing
    - `PlaylistRefreshWorkflow.test.tsx` - Refresh functionality testing

## Adding New Tests

### Integration Test (Recommended for Store Testing)

```typescript
// src/test/integration/YourWorkflow.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  TestDataFactory, 
  TestScenarios, 
  TestValidators, 
  TestDatabaseHelpers,
} from '../utils/testHelpers';
import { playlistStore } from '@/store/playlist';

// Mock external services
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

describe('Your Workflow Integration', () => {
  beforeEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
  });

  afterEach(async () => {
    await TestDatabaseHelpers.clearDatabase();
  });

  it('should handle complete workflow', async () => {
    // Setup test scenario
    const { playlist, versions } = await TestScenarios.setupFtrackPlaylistWithContent();
    
    // Execute workflow
    const result = await playlistStore.someOperation(playlist.id);
    
    // Validate results
    expect(result.success).toBe(true);
    await TestValidators.validateDatabaseConsistency();
  });
});
```

### Component Test

```typescript
// src/components/YourComponent.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderWithUserEvent, screen } from '../test/utils';
import { YourComponent } from './YourComponent';

describe('YourComponent', () => {
  it('should render correctly', () => {
    renderWithUserEvent(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const { user } = renderWithUserEvent(<YourComponent />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('After Click')).toBeInTheDocument();
  });
});
```

### Store Module Test (Use Integration Tests Instead)

For testing the modular store architecture (Repository, Cache, Sync, Manager), **prefer integration tests** over isolated unit tests. The store modules are designed to work together and integration tests catch more real-world issues.

```typescript
// If you must test individual modules:
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistRepository } from '@/store/playlist/PlaylistRepository';

vi.mock('@/store/db');

describe('PlaylistRepository', () => {
  let repository: PlaylistRepository;
  
  beforeEach(() => {
    repository = new PlaylistRepository();
    vi.clearAllMocks();
  });

  it('should create playlist with compound key', async () => {
    const entity = TestDataFactory.createPlaylistEntity();
    await repository.createPlaylist(entity);
    
    // Remember: versions use compound key [playlistId, versionId]
    expect(db.playlists.add).toHaveBeenCalledWith(entity);
  });
});
```

## Test Utilities

The `testHelpers.ts` file provides comprehensive utilities:

### TestDataFactory
```typescript
// Create realistic test data
const playlist = TestDataFactory.createPlaylistEntity({ name: 'Custom Name' });
const versions = TestDataFactory.createAssetVersions(3);
const scenarios = TestDataFactory.createRefreshScenario();
```

### TestScenarios
```typescript
// Setup complex test states
const { playlist, versions } = await TestScenarios.setupFtrackPlaylistWithContent();
const { playlist, freshVersions } = await TestScenarios.setupRefreshScenario();
const { playlist, ftrackVersions, manualVersions } = await TestScenarios.setupMixedContentScenario();
```

### TestValidators
```typescript
// Validate database state and consistency
await TestValidators.validateDatabaseConsistency();
await TestValidators.validateFtrackMetadata(playlist.id, 'ftrack-123');
await TestValidators.validateRemovedVersions(playlist.id, ['version-1']);
await TestValidators.validateDraftContent(playlist.id, 'version-1', 'content', 'draft');
```

### TestDatabaseHelpers
```typescript
// Database management
await TestDatabaseHelpers.clearDatabase();
const stats = await TestDatabaseHelpers.getDatabaseStats();
```

## Common Testing Patterns

### Database Testing with Compound Keys

**Important**: The database uses compound primary keys `[playlistId, versionId]` for versions:

```typescript
// ❌ Wrong - won't work with compound key
const version = await db.versions.get('version-1');

// ✅ Correct - use compound key
const version = await db.versions.get([playlistId, 'version-1']);
```

### Mocking External Services

```typescript
// Mock before importing store modules
vi.mock('@/services/ftrack', () => ({
  FtrackService: vi.fn().mockImplementation(() => ({
    getPlaylistVersions: vi.fn(),
  })),
  ftrackService: {
    getPlaylistVersions: vi.fn(),
  },
}));

// In tests, use vi.mocked() to access mock methods
vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(mockData);
```

### Testing Asynchronous Store Operations

```typescript
it('should handle async operations', async () => {
  const { playlist } = await TestScenarios.setupFtrackPlaylistWithContent();
  
  // Mock external service
  vi.mocked(ftrackService.getPlaylistVersions).mockResolvedValue(freshVersions);
  
  // Execute async operation
  const result = await playlistStore.refreshPlaylist(playlist.id);
  
  // Validate results
  expect(result.success).toBe(true);
  await TestValidators.validateDatabaseConsistency();
});
```

## Testing Best Practices

1. **Prefer Integration Tests**: For the modular store architecture, integration tests catch more issues than isolated unit tests
2. **Test Database Operations**: Use the real IndexedDB (via fake-indexeddb) to test data persistence
3. **Mock External Services Only**: Mock ftrack, file system, etc. but not internal store modules
4. **Use Compound Keys Correctly**: Remember `[playlistId, versionId]` for version queries
5. **Clean Database Between Tests**: Use `TestDatabaseHelpers.clearDatabase()` in beforeEach/afterEach
6. **Test Error Scenarios**: Network failures, invalid data, edge cases
7. **Validate Data Consistency**: Use `TestValidators.validateDatabaseConsistency()` after operations

## Debugging Tests

If tests are failing:

1. **Check Database Keys**: Ensure you're using compound keys `[playlistId, versionId]` for versions
2. **Verify Mock Setup**: Use `vi.mocked()` to access mocked methods properly
3. **Use Test UI**: Run `pnpm test:ui` for interactive debugging
4. **Check Database State**: Use `TestDatabaseHelpers.getDatabaseStats()` to inspect data
5. **Add Debug Logging**: Use `console.log` to trace execution flow
6. **Validate Test Isolation**: Ensure tests don't depend on each other

## Performance Notes

- **Integration tests run in ~600ms** - much faster than E2E tests
- **Database operations are in-memory** - no actual file I/O
- **Mock external services** - avoid network calls in tests
- **40+ integration tests complete in under 1 second** - very efficient

## Migration from Unit to Integration Tests

If you have existing unit tests that mock store modules heavily:

1. **Convert to integration tests** - test real workflows instead
2. **Remove excessive mocking** - only mock external services
3. **Use TestScenarios** - leverage pre-built complex test states
4. **Test complete workflows** - from user action to database persistence