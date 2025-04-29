# Code Documentation

This document provides an overview of the custom hooks, services, and backend logic within the AstraNotes application.

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

## Custom Hooks (`src/hooks`)

### `useConnectionStatus.ts`

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

### `useDebounce.ts`

A generic custom hook to debounce a value. This is useful for delaying updates based on rapid changes, such as user input in search fields.

- **`useDebounce<T>(value: T, delay: number): T`**:
    - Takes a generic `value` and a `delay` (in milliseconds) as input.
    - Returns a `debouncedValue` of the same type `T`.
    - Uses `useState` to hold the `debouncedValue`.
    - Uses `useEffect` to set a timer (`setTimeout`) when the input `value` or `delay` changes.
    - The timer updates the `debouncedValue` only after the specified `delay` has passed without the input `value` changing.
    - Cleans up the timer (`clearTimeout`) if the `value` or `delay` changes before the timer fires, or when the component unmounts.
- **Dependencies**: `useState`, `useEffect`.

## Services (`src/services`)

### `thumbnailService.ts`

Provides functions for fetching and caching thumbnails from ftrack.

- **Caching**: Uses a `Map` (`thumbnailCache`) to store fetched thumbnail blob URLs, keyed by `componentId-size`.
- **`fetchThumbnail(componentId: string | null | undefined, session: Session, options?: ThumbnailOptions): Promise<string | null>`**:
    - Takes an ftrack `componentId`, an active `session`, and optional `options` (currently only `size`).
    - Returns a Promise resolving to a blob URL (`string`) for the image, or `null` if fetching fails or `componentId` is invalid.
    - Checks the `thumbnailCache` first using a key combining `componentId` and the `size` from `useThumbnailSettingsStore`.
    - If not cached:
        - Generates the thumbnail URL using `session.thumbnailUrl()`.
        - Uses Tauri's `fetch` from `@tauri-apps/plugin-http` to bypass CORS issues when fetching the image data.
        - Converts the response `ArrayBuffer` to a `Blob`.
        - Creates a blob URL using `URL.createObjectURL()`.
        - Stores the blob URL in the `thumbnailCache`.
        - Returns the blob URL.
    - Handles errors during fetching and returns `null`.
- **`clearThumbnailCache(): void`**:
    - Clears the `thumbnailCache`.
    - Iterates through the cached URLs and calls `URL.revokeObjectURL()` on each to release memory. Logs errors during revocation.
- **Testing Exports (`_testing`)**: Exposes functions `addToCache`, `clearCache`, `getCacheSize` for testing purposes.
- **Dependencies**: `@tauri-apps/plugin-http`, `@ftrack/api`, `../store/thumbnailSettingsStore`.

### `ftrack.ts` (`FtrackService`)

A class-based service encapsulating all interactions with the ftrack API.

- **Initialization**:
    - Reads saved ftrack settings (`FtrackSettings`) from `localStorage` upon instantiation.
    - If settings exist, initializes an ftrack `Session` using `@ftrack/api`.
    - Fetches note labels (`fetchNoteLabels`) and status data (`fetchAllStatusData`, `fetchAllSchemaStatusData`) after session initialization.
    - Stores the current user ID (`currentUserId`) after successful session initialization.
- **Session Management**:
    - `initSession()`: Initializes the ftrack session using stored settings. Handles authentication errors.
    - `getSession()`: Returns the current session, initializing it if necessary. Throws an error if initialization fails.
    - `ensureSession()`: Similar to `getSession`, ensures a session exists.
    - `testConnection()`: Checks connectivity by initializing a session and querying the current user. Returns `true` on success, `false` on failure.
- **Playlist & Version Management**:
    - `getPlaylists()`: Fetches all `ReviewSession` entities and maps them to the `Playlist` type.
    - `getPlaylistVersions(playlistId: string)`: Fetches `ReviewSessionObject` entities for a given playlist ID, extracts `AssetVersion` details (id, name, version, thumbnailId), and maps them to the `AssetVersion` type.
    - `getPlaylistNotes(playlistId: string)`: Fetches `Note` entities associated with a playlist's review session objects and maps them to the `Note` type.
    - `searchVersions(options: SearchVersionsOptions)`: Searches for `AssetVersion` entities based on a search term (parsing `v[number]` for version filtering) and limit. Uses simple local storage caching (`getFromCache`, `addToCache`) with a 5-minute expiry. Maps results to `AssetVersion`.
- **Note Management**:
    - `publishNote(versionId: string, content: string, labelId?: string)`: Creates a basic `Note` entity linked to an `AssetVersion`, processing content for markdown compatibility. Optionally links a `NoteLabel`.
    - `publishNoteWithAttachments(versionId: string, content: string, labelId?: string, attachments?: Attachment[])`: Creates a `Note` and uploads/attaches `Attachment` files using `AttachmentService`.
    - `publishNoteWithAttachmentsWebUI(...)`: Creates a `Note` and uploads attachments using a method mimicking the ftrack web UI (`AttachmentService.createNoteWithAttachmentsWebUI`), intended to improve compatibility.
    - `publishNoteWithAttachmentsAPI(...)`: Creates a `Note` and uploads attachments using the official `@ftrack/api` `session.createComponent` method via `AttachmentService.createNoteWithAttachmentsAPI` for potentially greater reliability. Includes user ID linking.
- **Label Management**:
    - `fetchNoteLabels()`: Fetches all `NoteLabel` entities.
    - `getNoteLabels()`: Returns the cached list of note labels, fetching them if needed.
- **Status Management**:
    - `fetchApplicableStatuses(entityType: string, entityId: string)`: Determines the correct workflow schema for a given entity (AssetVersion, Task, or others via overrides) and fetches the list of applicable `Status` entities.
    - `fetchStatusPanelData(assetVersionId: string)`: Fetches data needed for the status panel, including the version's status, its parent's details (ID, status, type), and the project ID.
    - `updateEntityStatus(entityType: string, entityId: string, statusId: string)`: Updates the `status_id` of a given entity.
    - `fetchAllStatusData()`: Fetches *all* Statuses, ObjectTypes, WorkflowSchemas, and ProjectSchemaOverrides to build an internal mapping (`statusMapping`) for quick lookup of applicable statuses based *only* on entity type.
    - `getApplicableStatusesForType(entityType: string)`: Returns applicable statuses for an entity type using the pre-fetched `statusMapping`.
    - `fetchAllSchemaStatusData()`: Fetches *all* ProjectSchemas, ObjectTypes, Statuses, Schema (ProjectSchema <-> ObjectType link), and SchemaStatus (Schema <-> Status link) to build a detailed mapping (`schemaStatusMapping`) allowing lookup of valid statuses based on *ProjectSchema* and *ObjectType*.
    - `getStatusesForEntity(entityType: string, entityId: string)`: Uses the `schemaStatusMapping` (or workflow schema for AssetVersion) to find the precise list of valid statuses for a *specific entity* based on its project's schema and its type.
- **Component/Attachment Helpers**:
    - `getComponentUrl(componentId: string)`: Gets a downloadable URL for a component.
    - `getVersionComponents(versionId: string)`: Fetches all `Component` entities linked to an `AssetVersion`.
- **Settings**:
    - `updateSettings(settings: FtrackSettings)`: Updates the service's settings, saves them to `localStorage`, and re-initializes the session.
- **Utilities**:
    - `log(...args)`: Internal logging helper (active when `DEBUG` is true).
    - `mapNotesToPlaylist`, `mapVersionsToPlaylist`: Internal data mapping functions.
- **Dependencies**: `@/types`, `@ftrack/api`, `@/components/NoteAttachments`, `./attachmentService`.

### `attachmentService.ts` (`AttachmentService`)

A class-based service dedicated to handling file uploads and attachment management with ftrack, primarily designed to work within the Tauri environment.

- **Core Upload Logic (`uploadAttachment`)**:
    - This is a complex method attempting multiple strategies to upload a file and create a corresponding ftrack `Component`.
    - **File Handling**: Accepts `File` objects or Tauri file path `string`s (using `@tauri-apps/plugin-fs` via `getFileFromPath` helper to read file paths).
    - **Component Creation**: Creates a base `Component` entity in ftrack.
    - **Metadata**: Adds `ftr_meta` metadata based on file type (image, video, pdf) to aid ftrack's viewers. Includes dimension extraction for images (`getImageDimensions`).
    - **Upload Strategies (using `@tauri-apps/plugin-http`)**:
        1.  **Direct Component Upload**: Tries POSTing to `/component/upload` with `component_id` and file data.
        2.  **Component File Upload**: Tries POSTing to `/component/file` with `id` (component ID) and file data.
        3.  **Signed URL Upload**:
            - Gets upload metadata via GET `/component/{id}/get-signed-url`.
            - Handles **multi-part uploads** (if `urls` array is returned) by PUTing data chunks to each `signed_url` and then POSTing to `/component/{id}/complete-multipart-upload`.
            - Handles **direct URL uploads** (if `url` is returned) by PUTing data to the single URL, followed by POSTing to `/component/{id}/process`.
        4.  **Data URL Embedding**: (Fallback if direct uploads fail)
            - Converts file content to base64 (`arrayBufferToBase64`).
            - For small files (<= 256KB): Creates `Metadata` with key `ftrack_data` and a `data:` URL value.
            - For larger files: Creates `Metadata` with key `ftrack_data_chunked` (containing chunk info) and multiple `Metadata` entries (`ftrack_data_chunk_0`, `ftrack_data_chunk_1`, ...) containing base64 chunks.
            - Adds various other metadata flags (`data_stored`, `source_component`, `ftr_data`, `size`, `content_type`, `width`, `height`, `frame_rate`) to maximize compatibility.
    - **Component Location**: Creates a `ComponentLocation` linked to `ftrack.server` (and tries `ftrack.unmanaged`, `ftrack.origin`) to mark the component as available.
- **Web UI Style Upload (`uploadWebUIStyleAttachment`)**:
    - Attempts to replicate the specific API calls made by the ftrack web UI for uploads.
    - Creates a `FileComponent` with a UUID.
    - Tries multiple Tauri HTTP POST requests (`/component/upload`, `/component/file`, `/component/add`) to upload the file content.
    - Creates a `ComponentLocation` linked to `SERVER_LOCATION_ID`.
- **Official API Upload (`uploadAttachmentWithCreateComponent`)**:
    - Uses the `@ftrack/api` `session.createComponent` method, which handles the underlying upload mechanism (direct or signed URL).
    - Provides progress reporting via the `onProgress` callback.
    - This is intended as the most reliable method using the official library.
- **Batch Operations**:
    - `uploadAttachments`: Uploads an array of `Attachment` objects sequentially using `uploadAttachment`.
    - `createNoteWithAttachmentsWebUI`: Uploads attachments using `uploadWebUIStyleAttachment`, creates a note, and links components using `attachComponentsToNote`.
    - `createNoteWithAttachmentsAPI`: Uploads attachments using `uploadAttachmentWithCreateComponent`, creates a note (importantly linking the `user_id` if available), and links components using `attachComponentsToNote`. This is the preferred method for creating notes with attachments.
- **Attachment Linking (`attachComponentsToNote`)**:
    - Creates `NoteComponent` entities to link multiple uploaded `Component` IDs to a `Note` ID.
- **Validation**:
    - `validateAttachments`, `validateAttachment`: Perform basic checks on attachment objects (name, file presence, size limits, warnings for large files or missing info).
- **Helpers**:
    - `getFileFromPath`: Reads a file path using Tauri FS and returns a `File` object.
    - `getImageDimensions`: Extracts width/height from image files using `Image` objects and `URL.createObjectURL`.
    - `arrayBufferToBase64`: Converts `ArrayBuffer` to base64 string, handling large buffers in chunks.
    - `fileToBase64`: Converts a `File` to a base64 string using `FileReader`.
    - `getAuthHeaders`, `getServerUrl`: Extract credentials/URL from the ftrack session object.
    - `checkComponentExists`: Queries ftrack to see if a component ID already exists.
- **Dependencies**: `@ftrack/api`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-fs` (dynamic import), `uuid`. 