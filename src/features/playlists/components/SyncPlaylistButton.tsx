/**
 * @fileoverview SyncPlaylistButton.tsx
 * Button component for syncing local playlists to ftrack.
 * Features:
 * - Upload icon button with tooltip
 * - Confirmation modal with version list
 * - Progress indication during sync
 * - Success/error feedback
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePlaylistCreationStore } from '@/store/playlistCreationStore';
import { Playlist, AssetVersion } from '@/types';
import { Upload, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface SyncPlaylistButtonProps {
  playlist: Playlist;
  versionsToSync: AssetVersion[];
  onSyncSuccess: (playlistId: string) => void;
  onSyncError: (error: string) => void;
}

export function SyncPlaylistButton({
  playlist,
  versionsToSync,
  onSyncSuccess,
  onSyncError,
}: SyncPlaylistButtonProps) {
  const {
    isSyncing,
    syncError,
    syncProgress,
    syncPlaylist,
    clearErrors,
    resetSyncState,
  } = usePlaylistCreationStore();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [localSyncState, setLocalSyncState] = useState<{
    isResetting: boolean;
    hasReset: boolean;
  }>({ isResetting: false, hasReset: false });

  const handleSyncClick = async () => {
    console.log('Sync button clicked for playlist:', playlist.id);
    console.log('Current sync state before reset:', { isSyncing, syncError, syncProgress });
    
    setLocalSyncState({ isResetting: true, hasReset: false });
    clearErrors();
    resetSyncState(); // Reset sync progress to show fresh dialog
    
    // Give it a moment to reset
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setLocalSyncState({ isResetting: false, hasReset: true });
    console.log('After resetSyncState called and local state updated');
    setShowConfirmDialog(true);
  };

  const handleConfirmSync = async () => {
    console.log('Starting sync for playlist:', playlist.id);
    try {
      const ftrackId = await syncPlaylist(playlist.id);
      console.log('Sync completed successfully for playlist:', playlist.id, '-> ftrack ID:', ftrackId);
      setShowConfirmDialog(false);
      // Pass the new ftrack ID to the success handler
      onSyncSuccess(ftrackId);
    } catch (error) {
      console.error('Sync failed for playlist:', playlist.id, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync playlist';
      onSyncError(errorMessage);
    }
  };

  const handleCloseDialog = () => {
    if (!isSyncing) {
      setShowConfirmDialog(false);
      setLocalSyncState({ isResetting: false, hasReset: false });
      clearErrors();
    }
  };

  const getProgressText = () => {
    if (!syncProgress) return '';
    return `${syncProgress.current}/${syncProgress.total}`;
  };

  const getProgressPercentage = () => {
    if (!syncProgress) return 0;
    return (syncProgress.current / syncProgress.total) * 100;
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncClick}
              disabled={isSyncing || versionsToSync.length === 0}
              className="h-8 w-8 p-0"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {versionsToSync.length === 0 
                ? 'No versions to sync' 
                : `Sync ${versionsToSync.length} version${versionsToSync.length === 1 ? '' : 's'} to ftrack`
              }
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={showConfirmDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Sync Playlist to ftrack
            </DialogTitle>
          </DialogHeader>
          {(() => {
            console.log('Dialog is rendering, showConfirmDialog:', showConfirmDialog, 'versionsToSync:', versionsToSync.length);
            return null;
          })()}

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                This will create "{playlist.name}" as a {playlist.type === 'reviewsession' ? 'Review Session' : 'List'} in ftrack
                {versionsToSync.length > 0 && ` and add ${versionsToSync.length} version${versionsToSync.length === 1 ? '' : 's'}`}.
              </p>
            </div>

            {/* Version List */}
            {versionsToSync.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  Versions to sync ({versionsToSync.length})
                </h4>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/30">
                  {versionsToSync.map((version) => (
                    <div key={version.id} className="text-xs text-muted-foreground">
                      {version.name} v{version.version}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {isSyncing && syncProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Syncing...</span>
                  <span>{getProgressText()}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success Message */}
            {syncProgress?.current === syncProgress?.total && !isSyncing && !localSyncState.hasReset && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Playlist synced successfully!</span>
              </div>
            )}

            {/* Error Display */}
            {syncError && (
              <div className="p-3 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/20">
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {syncError}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseDialog}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Cancel'}
            </Button>
            {(() => {
              // Show sync button if not syncing AND (no progress OR reset locally)
              const hasProgress = syncProgress && syncProgress.current === syncProgress.total;
              const shouldShowSyncButton = !isSyncing && (!hasProgress || localSyncState.hasReset);
              console.log('Sync button visibility check:', {
                isSyncing,
                syncProgress,
                hasProgress,
                localSyncState,
                shouldShowSyncButton
              });
              return shouldShowSyncButton;
            })() && (
              <Button
                onClick={() => {
                  console.log('Sync to ftrack button clicked');
                  handleConfirmSync();
                }}
                disabled={isSyncing}
              >
                Sync to ftrack
              </Button>
            )}
            {syncProgress?.current === syncProgress?.total && !isSyncing && (
              <Button onClick={handleCloseDialog}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 