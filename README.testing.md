# AstraNotes Testing Documentation

## Overview

This document provides a quick guide for running and extending tests in the AstraNotes project. For more detailed information on testing strategies and best practices, see [docs/testing-guide.md](./docs/testing-guide.md).

## Running Tests

AstraNotes uses Vitest for testing. The following commands are available:

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
pnpm test:integration # Integration tests
```

## Test Structure

Tests are organized in the following structure:

- `src/test/` - Test setup and utilities
  - `setup.ts` - Global test setup
  - `utils.tsx` - Shared test utilities
  - `components/` - Component tests
  - `store/` - Store tests
  - `utils/` - Utility function tests
  - `services/` - Service tests
  - `integration/` - Integration tests

## Adding New Tests

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

### Store Test

```typescript
// src/store/yourStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useYourStore } from './yourStore';

describe('YourStore', () => {
  beforeEach(() => {
    // Reset store state
    act(() => {
      useYourStore.setState({ items: [] });
    });
  });

  it('should add items correctly', () => {
    const initialState = useYourStore.getState();
    expect(initialState.items).toEqual([]);

    act(() => {
      useYourStore.getState().addItem({ id: '1', name: 'New Item' });
    });

    const updatedState = useYourStore.getState();
    expect(updatedState.items).toHaveLength(1);
    expect(updatedState.items[0].name).toBe('New Item');
  });
});
```

## Common Testing Patterns

### Mocking a Store

```typescript
vi.mock('@/store/noteStore', () => ({
  useNoteStore: () => ({
    notes: [{ id: '1', content: 'Test Note' }],
    addNote: vi.fn(),
    removeNote: vi.fn(),
  }),
}));
```

### Mocking an External Service

```typescript
vi.mock('@/services/ftrack', () => ({
  ftrackService: {
    getCurrentProject: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Project' }),
  },
}));
```

### Testing Asynchronous Code

```typescript
it('should load data asynchronously', async () => {
  const { user } = renderWithUserEvent(<DataComponent />);
  
  // Trigger async action
  await user.click(screen.getByText('Load Data'));
  
  // Wait for the results to appear
  await waitFor(() => {
    expect(screen.getByText('Data Loaded')).toBeInTheDocument();
  });
});
```

## Testing Best Practices

1. **Test Behavior, Not Implementation**: Focus on what your component/function does, not how it does it.
2. **Keep Tests Isolated**: Each test should be independent from others.
3. **Prefer User-Centric Testing**: Test from the user's perspective when testing components.
4. **Use Good Test Names**: Describe what the test is checking, using the pattern "should [expected behavior] when [condition]".
5. **Mock External Dependencies**: Don't test third-party code.

## Debugging Tests

If tests are failing:

1. Use `console.log` to inspect values during test execution
2. Run with UI mode: `pnpm test:ui` to see detailed test results
3. Add `screen.debug()` to see the current DOM state in component tests
4. Check for proper mocking of external dependencies
5. Ensure test isolation - tests should not depend on each other
