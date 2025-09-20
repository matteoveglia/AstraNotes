# Automated Testing for Playlist Deduplication

This document explains how to use the automated tests for the playlist deduplication functionality that was implemented to fix the race condition issue.

## Overview

The automated tests cover:
- **Race condition prevention** - Ensures concurrent refresh operations don't create duplicates
- **Deduplication logic** - Verifies database versions are preferred over ftrack versions
- **Cleanup functionality** - Tests removal of existing duplicate entries
- **Performance** - Measures efficiency under load
- **Error handling** - Ensures graceful degradation

## Test Files

### Integration Tests
**File**: `src/test/integration/PlaylistDeduplication.test.tsx`

Tests the core deduplication functionality:
- Race condition prevention during concurrent refreshes
- Cleanup of existing duplicate entries
- Proper deduplication logic (database vs ftrack preference)
- Stable UUID generation
- Mixed scenario handling (existing + new playlists)
- Error handling

### Performance Tests
**File**: `src/test/performance/PlaylistDeduplicationPerformance.test.ts`

Tests performance under various load conditions:
- Large dataset handling (100+ playlists)
- Concurrent operations (10 simultaneous refreshes)
- Memory usage during repeated operations
- Database cleanup efficiency

## Running the Tests

### Quick Start
```bash
# Run all deduplication tests
./scripts/test-deduplication.sh

# Run only integration tests
./scripts/test-deduplication.sh integration

# Run only performance tests
./scripts/test-deduplication.sh performance
```

### Manual Test Execution
```bash
# Integration tests
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx

# Performance tests
npm run test -- src/test/performance/PlaylistDeduplicationPerformance.test.ts

# Specific test case
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --testNamePattern="race condition"
```

## Key Test Scenarios

### 1. Race Condition Prevention
**Test**: `should prevent duplicate database entries during concurrent refresh operations`

Simulates 3 concurrent refresh operations and verifies no duplicate database entries are created.

**Expected Result**: Exactly 2 database entries for 2 ftrack playlists, regardless of concurrent operations.

### 2. Duplicate Cleanup
**Test**: `should clean up existing duplicate entries before processing new ones`

Pre-populates database with 3 duplicate entries for the same ftrack playlist, then runs refresh.

**Expected Result**: Only 1 database entry remains (the oldest one).

### 3. Deduplication Logic
**Test**: `should prefer database version over ftrack version when both exist`

Creates a database playlist, then processes an ftrack playlist with the same `ftrackId` but different name.

**Expected Result**: Database version is kept, ftrack version is ignored.

### 4. Performance Under Load
**Test**: `should handle 100 playlists efficiently`

Processes 100 ftrack playlists and measures completion time.

**Expected Result**: Completes within 5 seconds, all playlists processed correctly.

## Interpreting Test Results

### Success Indicators
- ✅ All tests pass
- ✅ No duplicate database entries created
- ✅ Performance within acceptable thresholds
- ✅ Proper cleanup of existing duplicates

### Failure Indicators
- ❌ Multiple database entries for same `ftrackId`
- ❌ Performance degradation (>5s for 100 playlists)
- ❌ Memory leaks during repeated operations
- ❌ Existing duplicates not cleaned up

## Debugging Failed Tests

### Common Issues

1. **Race Condition Still Present**
   - Symptom: Multiple database entries for same `ftrackId`
   - Check: Deduplication logic in `loadPlaylists` function
   - Fix: Ensure atomic checks before database storage

2. **Cleanup Not Working**
   - Symptom: Existing duplicates remain after refresh
   - Check: Cleanup logic in `loadPlaylists` function
   - Fix: Verify duplicate detection and removal logic

3. **Performance Issues**
   - Symptom: Tests timeout or take too long
   - Check: Database query efficiency
   - Fix: Optimize database operations, add indexes if needed

### Debug Commands
```bash
# Run with verbose output
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --reporter=verbose

# Run single test with debug info
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --testNamePattern="race condition" --reporter=verbose

# Check database state during tests (add console.logs in test)
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --reporter=verbose --no-coverage
```

## Continuous Integration

Add these tests to your CI pipeline to catch regressions:

```yaml
# Example GitHub Actions step
- name: Test Playlist Deduplication
  run: ./scripts/test-deduplication.sh
```

## Manual Verification

After tests pass, you can also manually verify:

1. Open the app
2. Go to playlist panel
3. Click refresh multiple times rapidly
4. Check console logs for deduplication messages
5. Verify no duplicate playlists appear in UI

## Test Data

The tests use the `TestDataFactory` to create consistent test data:
- Ftrack playlists with proper metadata
- Database playlists with sync status
- Asset versions for playlist content

## Extending Tests

To add new test scenarios:

1. Add test cases to existing describe blocks
2. Use `TestDataFactory` for consistent test data
3. Follow existing patterns for async operations
4. Add performance benchmarks for new functionality

## Troubleshooting

### Test Environment Issues
- Ensure `fake-indexeddb` is properly configured
- Check that all mocks are reset between tests
- Verify database cleanup in `beforeEach`/`afterEach`

### Mock Service Issues
- Ensure ftrack services are properly mocked
- Check mock return values match expected data structure
- Verify mock calls are reset between tests