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
import { playlistStore } from '@/store/playlist';
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

  const handleSyncClick = async () => {
    console.log('Sync button clicked for playlist:', playlist.id);
    setSyncError(null);
    setSyncProgress(null);
    setShowConfirmDialog(true);
  };

  const handleConfirmSync = async () => {
    console.log('Starting sync for playlist:', playlist.id);
    setIsSyncing(true);
    setSyncProgress({ current: 1, total: 4 });
    
    try {
      // Listen for sync events to update progress
      const handleProgress = (data: any) => setSyncProgress(data.progress || { current: 2, total: 4 });
      const handleCompleted = (data: any) => setSyncProgress({ current: 4, total: 4 });
      
      playlistStore.on('sync-progress', handleProgress);
      playlistStore.on('sync-completed', handleCompleted);
      
      // Sync playlist - ID NEVER CHANGES with new architecture
      await playlistStore.syncPlaylist(playlist.id);
      
      // Clean up listeners
      playlistStore.off('sync-progress', handleProgress);
      playlistStore.off('sync-completed', handleCompleted);
      
      console.log('Sync completed successfully for playlist:', playlist.id, '(same ID - no remounting!)');
      setShowConfirmDialog(false);
      
      // Pass the SAME playlist ID - no navigation needed!
      onSyncSuccess(playlist.id);
    } catch (error) {
      console.error('Sync failed for playlist:', playlist.id, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync playlist';
      setSyncError(errorMessage);
      onSyncError(errorMessage);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloseDialog = () => {
    if (!isSyncing) {
      setShowConfirmDialog(false);
      setSyncError(null);
      setSyncProgress(null);
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
            {syncProgress?.current === syncProgress?.total && !isSyncing && (
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
            {!isSyncing && (!syncProgress || syncProgress.current < syncProgress.total) && (
              <Button
                onClick={handleConfirmSync}
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