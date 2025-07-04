# Code Documentation

This document provides an overview of the custom hooks, services, backend logic, and architectural patterns within the AstraNotes application.

## Architecture Overview

AstraNotes follows a modular architecture with clear separation of concerns:

- **Frontend**: React 18 with TypeScript, Tailwind CSS v4, and shadcn/ui components
- **Performance**: React Concurrent Mode with Suspense, useDeferredValue, and startTransition
- **State Management**: Zustand for UI state, modular store architecture for business logic
- **Database**: IndexedDB via Dexie for local data persistence with stable UUID architecture
- **Backend**: Tauri 2 for desktop integration and file system access
- **Testing**: Vitest with React Testing Library, emphasis on integration testing
- **External APIs**: ftrack integration via @ftrack/api

## Backend Logic (`src-tauri/src`)

### `lib.rs`

This file contains the main Tauri setup function (`run`).

- **`run()`**: Initializes the Tauri application context, sets up required plugins (Shell, Process, Dialog, FS, HTTP, Updater, Log), configures logging for debug builds, and runs the Tauri application loop. It uses `tauri::generate_context!()` to load application configuration and `tauri::Builder` to configure and run the application.

### `main.rs`

This file serves as the entry point for the Tauri backend process.

- **`main()`**:
    - Loads environment variables from a `.env` file in development mode using `dotenv::dotenv().ok()`.
    - Reads the Sentry DSN (Data Source Name) from the `.env` file (required). It parses the `.env` file content directly using `include_str!` to find the `SENTRY_TAURI` key.
    - Initializes the Sentry client for error reporting using the DSN and automatically configured release name.
    - Calls `app_lib::run()` from `lib.rs` to start the Tauri application.

## Store Architecture (`src/store`)

AstraNotes uses a modular store architecture with clear separation of concerns:

### Modular Store Pattern

Each domain (e.g., playlist) follows this structure:

```
src/store/playlist/
├── types.ts          # TypeScript interfaces and type definitions
├── Repository.ts     # Pure database CRUD operations
├── Cache.ts          # In-memory caching with TTL and LRU
├── Sync.ts           # External API synchronization
├── Manager.ts        # Business logic orchestration
├── index.ts          # Public API and event coordination
└── README.md         # Module documentation
```

### Key Principles

- **Stable UUIDs**: Entity IDs never change after creation
- **Compound Keys**: Versions use `[playlistId, versionId]` for database operations
- **Event-Driven**: Use EventEmitter for store-to-UI communication
- **Type Safety**: Comprehensive TypeScript interfaces throughout

### Database Schema (Dexie)

```typescript
db.version(2).stores({
  playlists: 'id, name, ftrackId, createdAt',
  versions: '[playlistId+id], name, version, assetName, isRemoved',
  notes: '[playlistId+versionId], content, status, createdAt',
  drafts: '[playlistId+versionId], content, savedAt',
});
```

## Features Organization (`src/features`)

Components and logic are organized by feature domain:

### Notes Feature (`src/features/notes`)
- **Components**: PublishingControls, PublishPanel, QuickNotesToPlaylistButton
- **Hooks**: useNoteManagement, useNotePublishing, useNoteDrafts
- **Purpose**: Note creation, editing, and publishing functionality

### Playlists Feature (`src/features/playlists`)
- **Components**: CreatePlaylistDialog, SyncPlaylistButton
- **Hooks**: usePlaylistModifications
- **Purpose**: Playlist creation and synchronization

### Versions Feature (`src/features/versions`)
- **Components**: VersionGrid, VersionItem, SearchPanel, ModificationsBanner
- **Hooks**: useVersionSelection, useThumbnailLoading, useNoteManagement
- **Purpose**: Version browsing, selection, and management

### Related Versions Feature (`src/components` & `src/services`)
- **Components**: RelatedVersionsModal, RelatedVersionsGrid, RelatedVersionsList, RelatedVersionItem, StatusSelector
- **Services**: relatedVersionsService (progressive data fetching & caching)
- **Purpose**: Display all asset versions that share the same shot as the current version, with powerful search, filtering, status editing, and multi-select capabilities. Versions can be added directly to the active playlist.

## Custom Hooks (`src/hooks`)

### Core Application Hooks

#### `useConnectionStatus.ts`

This custom hook manages the connection status to the ftrack server.

- **State Management**: Uses a Zustand store (`useConnectionStore`) to persist connection state (`isConnected`, `lastTested`).
- **`isConnected`**: Boolean state indicating if the connection to ftrack is currently active.
- **`lastTested`**: Timestamp (number) of the last connection test.
- **`setConnected(connected: boolean)`**: Action to update the connection status.
- **`setLastTested(time: number)`**: Action to update the last tested timestamp.
- **`useConnectionStatus()`**:
    - Provides the current `isConnected` status and `lastTested` time from the store.
    - Includes a `testConnection` function to manually trigger a connection test.
    - **Automatic Testing**:
        - Tests the connection immediately on mount if it hasn't been tested in the last 5 minutes.
        - Sets up an interval timer to automatically test the connection every 30 seconds using `ftrackService.testConnection()`.
        - Cleans up the interval timer on unmount.
- **Dependencies**: `useEffect`, `create` (Zustand), `ftrackService`.

#### `useDebounce.ts`

A generic custom hook to debounce a value. This is useful for delaying updates based on rapid changes, such as user input in search fields.

- **`useDebounce<T>(value: T, delay: number): T`**:
    - Takes a generic `value` and a `delay` (in milliseconds) as input.
    - Returns a `debouncedValue` of the same type `T`.
    - Uses `useState` to hold the `debouncedValue`.
    - Uses `useEffect` to set a timer (`setTimeout`) when the input `value` or `delay` changes.
    - The timer updates the `debouncedValue` only after the specified `delay` has passed without the input `value` changing.
    - Cleans up the timer (`clearTimeout`) if the `value` or `delay` changes before the timer fires, or when the component unmounts.
- **Dependencies**: `useState`, `useEffect`.

#### `useWhatsNew.ts`

Manages the What's New modal display logic and integrates with the update system.

- **Purpose**: Controls when to show release notes after app updates
- **Integration**: Works with the updater system to trigger modal on first launch after update
- **State Management**: Uses whatsNewStore for persistent state

### Video-Specific Hooks (`src/hooks/video`)

- **`useVideoControls.ts`**: Video playback controls and state management
- **`useVideoPlayback.ts`**: Playback state, seeking, and timeline interaction
- **`useKeyboardShortcuts.ts`**: Keyboard shortcuts for video navigation
- **`useTimelineScrubbing.ts`**: Timeline scrubbing and frame-accurate navigation

### Feature-Specific Hooks

Each feature directory contains domain-specific hooks that encapsulate business logic and provide clean APIs for components.

## Services (`src/services`)

### `ftrack.ts` (`FtrackService`)

A class-based service encapsulating all interactions with the ftrack API.

#### Core Functionality
- **Session Management**: Initializes and maintains ftrack API sessions
- **Playlist Operations**: Fetches playlists and versions from ftrack
- **Note Management**: Creates and publishes notes with attachments
- **Search**: Version search with caching and filtering
- **Status Management**: Workflow status updates and schema handling

#### Key Methods
- `getPlaylists()`: Fetches all ReviewSession entities
- `getPlaylistVersions(playlistId)`: Fetches versions for a specific playlist
- `publishNote()`: Creates notes with various attachment strategies
- `searchVersions()`: Searches for versions with local caching
- `testConnection()`: Validates ftrack connectivity

#### Error Handling
- Uses custom `FtrackApiError` class for typed error handling
- Implements retry logic with exponential backoff
- Provides detailed error context for debugging

### `thumbnailService.ts`

Provides functions for fetching and caching thumbnails from ftrack.

- **Caching**: Uses a `Map` (`thumbnailCache`) to store fetched thumbnail blob URLs, keyed by `componentId-size`.
- **`fetchThumbnail(componentId, session, options?)`**: Fetches thumbnails with size options and caching
- **`clearThumbnailCache()`**: Cleans up blob URLs to prevent memory leaks
- **CORS Handling**: Uses Tauri's fetch to bypass browser CORS restrictions
- **Testing**: Exports testing utilities for cache management

### `attachmentService.ts` (`AttachmentService`)

Handles file uploads and attachment management with multiple upload strategies.

#### Upload Strategies
1. **Direct Component Upload**: POST to `/component/upload`
2. **Component File Upload**: POST to `/component/file`
3. **Signed URL Upload**: Multi-part or direct URL uploads
4. **Data URL Embedding**: Base64 fallback for small files

#### Key Features
- **Progress Reporting**: Upload progress callbacks
- **Error Recovery**: Multiple fallback strategies
- **Metadata Handling**: Automatic image dimension extraction
- **Platform Support**: Works with both File objects and Tauri file paths

### `relatedVersionsService.ts` (`RelatedVersionsService`)

Provides progressive data fetching and caching for related versions.

- **Caching**: Uses a `Map` (`relatedVersionsCache`) to store fetched related versions, keyed by `playlistId-versionId`.
- **`fetchRelatedVersions(playlistId, versionId, options?)`**: Fetches related versions for a specific version, including pagination and caching.
- **`clearRelatedVersionsCache(playlistId, versionId)`**: Clears the cache for a specific version.
- **`getRelatedVersions(playlistId, versionId)`**: Retrieves cached related versions or fetches them if not available.

### Additional Services

- **`githubService.ts`**: GitHub API integration for What's New feature
- **`videoService.ts`**: Video processing and playback utilities

## Testing Architecture (`src/test`)

AstraNotes uses **integration testing as the primary approach** for testing the modular store architecture.

### Test Philosophy
- **Integration tests**: Primary approach for store architecture (~600ms execution)
- **Component tests**: For UI behavior and user interactions
- **Unit tests**: For pure utility functions
- **Real database**: Uses fake-indexeddb for authentic IndexedDB behavior

### Test Structure
```
src/test/
├── setup.ts                    # Global test configuration
├── utils/
│   ├── testHelpers.ts         # Comprehensive test utilities
│   └── factories.ts           # Realistic test data generation
├── integration/               # Primary testing approach
│   ├── CriticalWorkflows.test.tsx
│   ├── PlaylistStoreIntegration.test.tsx
│   └── PlaylistRefreshWorkflow.test.tsx
├── components/                # Component behavior tests
├── store/                     # Individual store module tests
└── services/                  # Service integration tests
```

### Test Utilities

#### TestDataFactory
Creates realistic test data with proper relationships:
- `createPlaylistEntity()`: Generates playlist entities
- `createAssetVersions()`: Creates arrays of version entities
- `createRefreshScenario()`: Sets up complex test scenarios

#### TestScenarios
Sets up complex application states:
- `setupFtrackPlaylistWithContent()`: Playlist with versions and notes
- `setupMixedContentScenario()`: Mixed ftrack and manual content
- `setupRefreshScenario()`: Pre and post refresh state

#### TestValidators
Validates database consistency and business logic:
- `validateDatabaseConsistency()`: Ensures referential integrity
- `validateFtrackMetadata()`: Verifies external sync state
- `validateDraftContent()`: Checks draft persistence

### Database Testing Patterns

**Critical**: The database uses compound primary keys `[playlistId, versionId]` for versions:

```typescript
// ✅ Correct compound key usage
const version = await db.versions.get([playlistId, versionId]);

// ✅ Query versions for playlist
const versions = await db.versions.where('[playlistId+id]').between(
  [playlistId, ''], 
  [playlistId, '\uffff']
).toArray();
```

## Component Architecture

### UI Components (`src/components`)
- **Base Components**: Shared UI building blocks
- **Feature Components**: Domain-specific components
- **shadcn/ui Integration**: Consistent design system components

### Component Patterns
- **Event-Driven Updates**: Components listen to store events
- **Error Boundaries**: Isolate errors to specific component trees
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Responsive Design**: Mobile-first approach with Tailwind CSS

## Utilities and Helpers (`src/utils`)

### Core Utilities
- **`errorHandling.ts`**: Error categorization and handling utilities
- **`network.ts`**: Network connectivity and retry logic
- **`menu.ts`**: Application menu configuration

### Library Utilities (`src/lib`)
- **`settings.ts`**: Application settings management
- **`updater.ts`**: Update checking and installation
- **`exportUtils.ts`**: Data export functionality
- **`logExporter.ts`**: Diagnostic log generation

## Type System (`src/types`)

### Domain Types
- **`index.ts`**: Core application types (Playlist, AssetVersion, Note)
- **`customAttributes.ts`**: ftrack custom attribute definitions

### Type Patterns
- **Branded Types**: Type-safe IDs to prevent confusion
- **Result Types**: Consistent error handling patterns
- **Event Types**: Typed event emissions for store communication
- **Generic Utilities**: Reusable type patterns across domains

## Development Workflow

### File Organization
- **Absolute Imports**: Use `@/` prefix for clean import paths
- **Index Files**: Provide clean exports from feature directories
- **README Files**: Document complex modules and architectural decisions

### Code Quality
- **TypeScript Strict Mode**: Comprehensive type checking
- **ESLint Configuration**: Consistent code style
- **File Size Limits**: Keep modules focused and maintainable
- **Documentation**: JSDoc comments for public APIs

This architecture provides a scalable, testable, and maintainable foundation for the AstraNotes application while ensuring clear separation of concerns and type safety throughout. 