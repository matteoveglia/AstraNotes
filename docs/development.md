# Development

This document describes how to set up the development environment and build AstraNotes.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)
- [PNPM](https://pnpm.io/) (v9.x or later)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri v2](https://tauri.app/start/prerequisites/)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/matteoveglia/AstraNotes.git
   cd AstraNotes
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file with your Sentry DSN (optional for error tracking):
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Start the development server:
   ```bash
   pnpm tauri:dev
   ```

## Demo Mode (Mock Data)

- Toggle between live ftrack data and the bundled demo dataset from the Settings modal (or via `useAppModeStore.setMode("demo")`).
- In Demo Mode, services resolve through façade clients (`versionClient()`, `statusClient()`, `relatedNotesClient()`) that call mock implementations seeded from `src/services/mock/demoSeed.ts`.
- Related Versions and Related Notes modals now operate entirely on the mock dataset, including status updates and note metadata.
- When adding new features, prefer routing external calls through the appropriate client in `src/services/client/index.ts` so Demo Mode continues to function without network access.
- Regenerate the dataset with `pnpm generate:demo-seed --mock-root=/path/to/AstraNotes_MockData` (defaults to `~/Downloads/AstraNotes_MockData` when the flag/env var is omitted).


AstraNotes uses a custom build script for building platform-specific binaries:

### macOS (Apple Silicon):
```bash
pnpm tauri:build:mac
```
### macOS (Universal) - Not Tested:
```bash
pnpm tauri:build:macuniversal
```

### Windows:
```bash
pnpm tauri:build:win
```

The build script handles versioning, signing, and creating updater artifacts automatically.

## Testing

AstraNotes uses Vitest for testing with comprehensive test coverage. Run tests with:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run specific test types
pnpm test:component   # Component tests
pnpm test:store       # Store tests (prefer integration)
pnpm test:utils       # Utility tests
pnpm test:integration # Integration tests (primary approach)
```

### Testing Philosophy

- **Integration Testing**: Primary approach for store architecture (~600ms execution)
- **Component Testing**: For UI behavior and user interactions
- **Unit Testing**: For pure utility functions
- **Real Database**: Uses fake-indexeddb for authentic IndexedDB testing

See [Testing Quick Reference](./testing-quickref.md) and [Testing Guide](./testing-guide.md) for detailed testing practices.

## Development Tools


Interactive component development and documentation:

```bash
```

### Code Quality
```bash
# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type checking
pnpm type-check
```

## Project Structure

```
AstraNotes/
├── src/                      # React frontend source code
│   ├── components/           # Reusable UI components
│   │   └── ui/              # shadcn/ui base components
│   ├── features/             # Feature-organized components and hooks
│   │   ├── notes/           # Note management feature
│   │   ├── playlists/       # Playlist management feature
│   │   └── versions/        # Version browsing feature
│   ├── hooks/               # Custom React hooks
│   │   └── video/          # Video-specific hooks
│   ├── services/            # External service integrations
│   ├── store/               # Modular state management
│   │   └── playlist/       # Playlist store modules
│   ├── utils/               # Utility functions
│   ├── lib/                 # Core utilities and helpers
│   ├── types/               # TypeScript type definitions
│   ├── test/                # Test files and utilities
│   │   ├── integration/    # Integration tests (primary)
│   │   ├── components/     # Component tests
│   │   ├── store/          # Store tests
│   │   └── utils/          # Test utilities and factories

├── src-tauri/               # Tauri backend code
│   └── src/                 # Rust source code
├── docs/                    # Documentation
│   ├── development.md      # This file
│   ├── testing-guide.md    # Comprehensive testing guide
│   ├── testing-quickref.md # Quick testing reference
│   └── *.md                # Additional documentation
└── public/                  # Static assets
```

## Architecture Overview

### Frontend Stack
- **React 18** with TypeScript for UI components and Concurrent Mode patterns
- **Tailwind CSS v4** with shadcn/ui for styling and design system
- **Zustand** for UI state management
- **Dexie** for IndexedDB database operations
- **Vitest** + React Testing Library for testing

### Backend Integration
- **Tauri 2** for desktop integration and file system access
- **@ftrack/api** for ftrack API integration
- **EventEmitter** for store-to-UI communication

### Store Architecture
- **Modular Design**: Each domain (playlist, notes, etc.) has separate modules
- **Repository Pattern**: Pure database operations
- **Event-Driven**: Components listen to store events
- **Type Safety**: Comprehensive TypeScript interfaces

### Key Features
- **Compound Keys**: Database uses `[playlistId, versionId]` for version entities
- **Stable UUIDs**: Entity IDs never change after creation
- **Integration Testing**: Primary testing approach for store workflows
- **Feature Organization**: Components grouped by domain functionality

## Development Workflow

### Code Organization
- Use absolute imports with `@/` prefix
- Group components by feature in `features/` directory
- Keep reusable components in `components/ui/`
- Use index.ts files for clean exports

### Testing Workflow
1. **Write Integration Tests** for store workflows
2. **Write Component Tests** for UI behavior
3. **Write Unit Tests** for utility functions
4. Use `TestDataFactory` for realistic test data
5. Validate database consistency with `TestValidators`

### Error Handling
- Use custom error classes with typed context
- Implement retry logic with exponential backoff
- Provide user-friendly error messages
- Log errors with appropriate detail levels

## Release Process

1. Run the build script with the target platform:
   ```bash
   node build.js [mac|macuniversal|win]
   ```

2. The script will:
   - Prompt for a new version number
   - Build the application for the target platform
   - Create signature files for updates
   - Generate update metadata in `latest.json`
   - Move build artifacts to `dist-tauri/`

3. Upload the generated artifacts and `latest.json` to GitHub releases

## Debugging

### Development Debugging
- Use browser dev tools for frontend debugging
- Check Tauri console for backend logs

- Run tests with `--ui` flag for interactive debugging

### Test Debugging
- Use `TestDatabaseHelpers.getDatabaseStats()` to inspect database state
- Add `console.log` statements in test scenarios
- Use `pnpm test:ui` for interactive test debugging
- Check test coverage with `pnpm test:coverage`

### Performance Monitoring
- Monitor bundle size with build analysis
- Check database query performance
- Use React DevTools Profiler for component performance
- Test with large datasets to ensure scalability

## Troubleshooting

### Common Issues

1. **Compound Key Errors**: Remember to use `[playlistId, versionId]` for version queries
2. **Mock Hoisting**: Define mocks inside `vi.mock()` factory functions
3. **Database State**: Use `TestDatabaseHelpers.clearDatabase()` between tests
4. **Import Errors**: Ensure absolute imports use `@/` prefix correctly

### Getting Help
- Check the [Testing Guide](./testing-guide.md) for testing issues
- Review [Code Documentation](./code-documentation.md) for architecture questions
- Check the project's GitHub issues for known problems