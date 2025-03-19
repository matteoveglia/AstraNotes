# AstraNotes Testing Guide

> **Comprehensive guide for the AstraNotes testing strategy**  
> For a quick reference to running tests, see [testing-quickref.md](./testing-quickref.md)

## Overview

This document outlines the testing strategy and best practices for the AstraNotes project. The testing suite uses Vitest for logic testing and React Testing Library for React components, ensuring comprehensive coverage across all parts of the application.

## Testing Stack

- **Vitest**: Main test runner for unit and integration tests
- **React Testing Library**: For testing React components
- **@testing-library/user-event**: For simulating user interactions
- **happy-dom**: For DOM environment in Node.js
- **@vitest/ui**: For visual UI for test results

## Test Directory Structure

```
src/
└── test/
    ├── setup.ts                     # Test setup and configuration
    ├── utils.tsx                    # Test utilities and helpers
    ├── components/                  # Component tests
    │   └── Component.test.tsx
    ├── store/                       # Zustand store tests
    │   └── store.test.ts
    ├── utils/                       # Utility function tests
    │   └── util.test.ts
    ├── services/                    # Service tests
    │   └── service.test.ts
    └── integration/                 # Integration tests
        └── Feature.test.tsx
```

## Test Types

### 1. Unit Tests

Test individual functions, components, and stores in isolation.

Examples:
- Component rendering and interactions
- Store state management
- Utility function behavior
- Service method functionality

### 2. Integration Tests

Test interaction between multiple components or systems.

Examples:
- Note creation flow
- Playlist management
- Label assignment

### 3. End-to-End Tests (Future)

Test complete user flows and application behavior from start to finish.

Examples:
- Full note creation and management workflow
- Integration with ftrack
- Application startup and initialization

## Writing Tests

### General Guidelines

1. Follow the AAA pattern (Arrange, Act, Assert)
2. Use descriptive test names following the pattern: "should [expected behavior] when [condition]"
3. Keep tests small and focused
4. Mock external dependencies
5. Clean up resources after each test

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
});
```

### Store Test Example

```typescript
// Store Test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useStore } from './store';

describe('Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    act(() => {
      useStore.setState({ 
        data: [], 
        isLoading: false, 
        error: null 
      });
    });
  });

  it('should update state correctly', () => {
    const initialState = useStore.getState();
    expect(initialState.data).toEqual([]);

    act(() => {
      useStore.getState().setData([{ id: '1', name: 'Test' }]);
    });

    const updatedState = useStore.getState();
    expect(updatedState.data).toEqual([{ id: '1', name: 'Test' }]);
  });
});
```

### Integration Test Example

```typescript
// Integration Test
import { describe, it, expect, vi } from 'vitest';
import { renderWithUserEvent, screen, waitFor } from '../utils';
import { App } from '@/App';

describe('Note Creation Flow', () => {
  it('should allow creating a note with labels', async () => {
    const { user } = renderWithUserEvent(<App />);
    
    // Navigate to notes section
    await user.click(screen.getByText('Notes'));
    
    // Fill in note details
    await user.type(screen.getByPlaceholderText('Add a note'), 'Test note');
    
    // Add label
    await user.click(screen.getByText('Add Label'));
    await user.click(screen.getByText('Feature'));
    
    // Submit note
    await user.click(screen.getByText('Save'));
    
    // Verify note was added
    await waitFor(() => {
      expect(screen.getByText('Test note')).toBeInTheDocument();
      expect(screen.getByText('Feature')).toBeInTheDocument();
    });
  });
});
```

## Mocking

### Mocking Zustand Stores

```typescript
// Example of mocking a Zustand store
vi.mock('@/store/noteStore', () => ({
  useNoteStore: () => ({
    notes: [{ id: '1', content: 'Test Note' }],
    addNote: vi.fn(),
    removeNote: vi.fn(),
  }),
}));
```

### Mocking External Services

```typescript
// Example of mocking an external service
vi.mock('@/services/ftrack', () => ({
  ftrackService: {
    getCurrentProject: vi.fn().mockResolvedValue({ id: 'project-id', name: 'Test Project' }),
    getAssets: vi.fn().mockResolvedValue([{ id: 'asset-1', name: 'Test Asset' }]),
  },
}));
```

### Mocking Browser APIs

```typescript
// Example of mocking fetch
vi.mock('global', () => ({
  fetch: vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data: 'test' }),
  }),
}));
```

## Running Tests

### Available Scripts

- `pnpm test`: Run tests in watch mode
- `pnpm test:run`: Run tests once
- `pnpm test:coverage`: Run tests and generate coverage report
- `pnpm test:ui`: Run tests with UI

### Continuous Integration

Tests are automatically run on pull requests to ensure code quality.

## Test Coverage

Aim for high test coverage in critical parts of the application:

- Core business logic: 90%+
- UI components: 80%+
- Utilities: 90%+
- Store: 90%+

## Debugging Tests

- Use `console.log` for simple debugging
- Use UI mode with `pnpm test:ui` for interactive debugging
- Use `screen.debug()` to print the current DOM state in component tests

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
2. **Don't Test Third-Party Code**: Assume libraries work as documented
3. **Keep Tests Fast**: Slow tests discourage frequent testing
4. **Make Tests Deterministic**: Tests should yield the same results every time
5. **Use Real DOM Testing**: Test actual user interactions where possible
6. **Separate Test Data Setup**: Extract test data creation to helper functions
7. **Test Edge Cases**: Include tests for error handling, boundary conditions, etc.