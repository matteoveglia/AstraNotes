# Related Versions Feature

The Related Versions feature lets users quickly browse and manage all asset versions belonging to the same shot as the currently selected version. It offers powerful filtering, status editing, and playlist integration – all wrapped in a performant, progressive-loading modal.

## Overview

When the user opens the Related Versions modal (via the Related button in NoteInput), AstraNotes extracts the shot name from the current version and queries ftrack for every version that shares that shot.  Results are cached so subsequent opens are instant.  The modal supports Grid and List views, search, filtering by workflow status, multi-select with cross-page persistence, and the ability to add the selected versions directly to the active playlist.

## Components

### 1. RelatedVersionsModal (`src/components/RelatedVersionsModal.tsx`)
* Top-level Radix Dialog that orchestrates data fetching, view switching, pagination, search, and selection state.
* Implements progressive loading so basic card data appears immediately, followed by thumbnails and statuses.
* Provides header controls (status filter, sort dropdown, view toggle) and footer actions (pagination, Add Selected Versions).

### 2. RelatedVersionsGrid (`src/components/RelatedVersionsGrid.tsx`)
* Responsive 1–4 column grid of `RelatedVersionItem` cards.
* Uses Framer-Motion for smooth view transitions and skeleton loaders while data is fetching.

### 3. RelatedVersionsList (`src/components/RelatedVersionsList.tsx`)
* Sortable table view mirroring the VersionSearch list layout.
* Header clicks or the global sort dropdown control the ordering.

### 4. RelatedVersionItem (`src/components/RelatedVersionItem.tsx`)
* Re-usable row/card component powering both Grid & List views.
* Supports thumbnail modal preview, workflow status editing, and checkbox selection.
* Wrapped in `React.memo` to avoid unnecessary re-renders.

### 5. StatusSelector (`src/components/StatusSelector.tsx`)
* Lightweight dropdown for editing version & shot workflow statuses.
* Optimistically updates UI while persisting changes to ftrack.

## Services

### RelatedVersionsService (`src/services/relatedVersionsService.ts`)
* Provides `fetchRelatedVersions`, `batchFetchShotStatuses`, and caching helpers.
* Extracts shot names using multiple naming conventions (ASE###, SQ###_SH###, shot_###).
* Caches both version data and workflow statuses to minimise API traffic and UI flicker.

## How It Works

1. **Shot Extraction** – The service parses the selected version name to determine its shot identifier.
2. **Data Fetching** – Versions, thumbnails, and workflow statuses are fetched in parallel; results are cached.
3. **Progressive Loading** – The modal shows basic card data immediately, then fills in thumbnails & statuses with skeleton placeholders.
4. **Interaction** – Users can search, filter by status, sort, select versions across pages, and switch between Grid/List views instantly (React 18 concurrent features).
5. **Playlist Integration** – Clicking “Add Selected Versions” passes the selected version IDs back to `MainContent`, which adds them to the active playlist and fires a toast.

## Usage

*Open the modal* by clicking the Related button in the NoteInput panel.

*Select versions* with the checkboxes or by shift-clicking a range, filter by status, search by name/version, then press **Add Selected Versions** to append them to the current playlist.

## Error Handling

* API failures during progressive loading are isolated – a thumbnail or status fetch failure only affects the relevant field and shows a fallback.
* All ftrack mutations are wrapped in `try/catch` with user-friendly toasts.

## Testing

Integration & component tests live in:
* `src/test/integration/CriticalWorkflows.test.tsx` – covers selection & playlist addition.
* `src/test/components/RelatedVersionItem.test.tsx` – ensures thumbnail modal & selection logic.

## Storybook

Interactive stories are available under **Features ➜ Related Versions**:
* Grid view, List view
* Loading states
* Status editing

Run `pnpm storybook` to explore the component suite. 