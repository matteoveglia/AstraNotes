# What's New Feature

The What's New feature in AstraNotes automatically displays release notes from GitHub when the application is updated, providing users with information about new features, bug fixes, and improvements.

## Overview

The What's New modal fetches release information directly from the GitHub API and displays it in a user-friendly format with markdown rendering. It automatically shows after app updates and can also be triggered manually from the top bar.

## Components

### 1. GitHub Service (`src/services/githubService.ts`)
- Fetches release data from GitHub API
- Handles API errors and rate limiting
- Formats release notes for display

### 2. What's New Store (`src/store/whatsNewStore.ts`)
- Manages modal state and version tracking
- Caches release data to avoid repeated API calls
- Tracks which versions have been shown to the user

### 3. Markdown Renderer (`src/components/MarkdownRenderer.tsx`)
- Lightweight markdown parser for release notes
- Handles headers, lists, bold/italic text, and inline code
- No external dependencies required

### 4. What's New Modal (`src/components/WhatsNewModal.tsx`)
- Main modal component for displaying release notes
- Supports both manual trigger and auto-show modes
- Includes loading states and error handling

### 5. useWhatsNew Hook (`src/hooks/useWhatsNew.ts`)
- Manages modal display logic
- Determines when to show modal after updates
- Integrates with update system

## How It Works

1. **Update Detection**: When an update is installed via the updater system, a flag is set to show the What's New modal on next app start.

2. **Version Tracking**: The store tracks which app version the modal was last shown for, preventing duplicate displays.

3. **Data Fetching**: Release data is fetched from GitHub API with caching to avoid rate limits.

4. **Display Logic**: The modal automatically shows on first launch after an update, or can be triggered manually.

## Usage

### Manual Trigger
Users can click the sparkles icon (✨) in the top bar to view the latest release notes at any time.

### Automatic Display
The modal automatically appears after app updates, showing the latest release notes.

### Integration with Updates
The updater system (`src/lib/updater.ts`) sets the appropriate flags when installing updates to trigger the modal on next startup.

## Configuration

The feature uses the following configuration:
- **GitHub Repository**: `matteoveglia/AstraNotes`
- **Cache Duration**: 1 hour for release data
- **API Endpoint**: GitHub REST API v3

## Error Handling

- Network errors fall back to cached data if available
- API rate limiting is handled gracefully
- User-friendly error messages for connection issues

## Testing

Tests are available in `src/test/components/WhatsNewModal.test.tsx` and cover:
- Component rendering
- Modal state management
- User interactions
- Error scenarios