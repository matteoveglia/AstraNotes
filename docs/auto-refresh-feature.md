# Auto-Refresh Feature

## Overview

The auto-refresh functionality automatically checks for changes in ftrack playlists every 5 seconds when enabled. This feature was restored and enhanced with robust race condition prevention, proper integration with the settings store, and detailed version data for UI feedback.

## Implementation Details

### Core Components

1. **PlaylistStore Auto-Refresh Methods**
   - `startAutoRefresh(playlistId, callback?)`: Starts auto-refresh for a playlist
   - `stopAutoRefresh()`: Stops current auto-refresh
   - `isAutoRefreshActive()`: Returns whether auto-refresh is currently running
   - `getCurrentAutoRefreshPlaylistId()`: Returns the currently auto-refreshing playlist ID

2. **useAutoRefresh Hook**
   - Provides a React hook interface for managing auto-refresh
   - Integrates with settings store for automatic enable/disable
   - Handles component lifecycle and cleanup

3. **Settings Integration**
   - Toggle in Settings Modal to enable/disable auto-refresh
   - `autoRefreshEnabled` setting in settings store
   - Automatic start/stop based on setting changes

4. **Enhanced Version Data**
   - Auto-refresh returns detailed version information
   - ModificationsBanner tooltip shows actual added/removed versions
   - Event data includes `addedVersions` and `removedVersions` arrays

### Race Condition Prevention

- **Single Instance**: Only one playlist can be auto-refreshed at a time
- **Overlap Prevention**: New auto-refresh calls stop existing instances
- **Settings Check**: Each refresh cycle validates settings haven't changed
- **Busy State**: Prevents overlapping refresh operations on the same playlist

### Event System

Auto-refresh emits the following events with enhanced data:
- `auto-refresh-completed`: When a refresh completes successfully (includes version data)
- `auto-refresh-failed`: When a refresh fails
- `playlist-refreshed`: When any refresh (manual or auto) completes (includes version data)

### ModificationsBanner Enhancement

The ModificationsBanner now displays detailed information in its tooltip:
- Shows names and version numbers of added versions
- Shows names and version numbers of removed versions
- Uses actual version data from auto-refresh events
- Provides clear visual feedback with + and - indicators

## Usage

### Basic Usage in Components

```typescript
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

function PlaylistComponent({ playlistId }: { playlistId: string }) {
  const { isAutoRefreshActive, stopAutoRefresh } = useAutoRefresh({
    playlistId,
    isEnabled: true,
    onRefreshCompleted: (result) => {
      if (result.success && (result.addedCount || result.removedCount)) {
        console.log(`Changes detected: +${result.addedCount} -${result.removedCount}`);
        console.log('Added versions:', result.addedVersions);
        console.log('Removed versions:', result.removedVersions);
      }
    },
  });

  return (
    <div>
      <p>Auto-refresh: {isAutoRefreshActive ? 'Active' : 'Inactive'}</p>
      <button onClick={stopAutoRefresh}>Stop Auto-refresh</button>
    </div>
  );
}
```

### Manual Control

```typescript
import { playlistStore } from '@/store/playlist';

// Start auto-refresh manually with detailed callback
await playlistStore.startAutoRefresh('playlist-id', (result) => {
  if (result.success) {
    console.log('Refresh result:', {
      added: result.addedCount,
      removed: result.removedCount,
      addedVersions: result.addedVersions,
      removedVersions: result.removedVersions,
    });
  }
});

// Stop auto-refresh
playlistStore.stopAutoRefresh();

// Check status
const isActive = playlistStore.isAutoRefreshActive();
const currentPlaylistId = playlistStore.getCurrentAutoRefreshPlaylistId();
```

## Behavioral Rules

1. **Quick Notes Exclusion**: Auto-refresh never runs for "quick-notes" playlist
2. **Local Playlist Exclusion**: Auto-refresh only works for playlists with ftrackId
3. **Settings Dependency**: Auto-refresh stops immediately when disabled in settings
4. **Component Lifecycle**: Auto-refresh stops when component unmounts
5. **Playlist Switching**: Changing playlists stops old auto-refresh and starts new one

## Integration Points

- **MainContent.tsx**: Main auto-refresh logic for active playlist
- **SettingsModal.tsx**: Settings toggle and cache clearing integration
- **usePlaylistModifications.tsx**: Event listener for auto-refresh results with version data
- **ModificationsBanner.tsx**: Enhanced tooltip with actual version details
- **TopBar.tsx**: Shows "Auto Updates Off" when disabled

## Testing

Auto-refresh functionality is covered by:
- Unit tests for individual methods
- Integration tests for store/settings interaction with version data
- Component tests for UI behavior and tooltip functionality

Run tests: `pnpm test AutoRefreshIntegration.test.tsx`

## Configuration

- **Interval**: 5 seconds (configurable via `AUTO_REFRESH_INTERVAL`)
- **Startup Delay**: 1 second delay before first refresh
- **Error Handling**: Graceful degradation on ftrack connectivity issues
- **Version Data**: Full version objects with name, version number, and metadata

## Legacy Compatibility

The implementation maintains backward compatibility with the old polling system:
- `startPolling()` → redirects to `startAutoRefresh()`
- `stopPolling()` → redirects to `stopAutoRefresh()`
- Event format conversion for existing callbacks

## Recent Enhancements

### Version Data Enhancement
- **Enhanced Return Type**: `refreshPlaylist()` now returns `addedVersions` and `removedVersions` arrays
- **Detailed Events**: Auto-refresh events include actual version objects, not just counts
- **Tooltip Functionality**: ModificationsBanner tooltip now shows specific version names and numbers
- **Type Safety**: Full TypeScript support for version data throughout the system 