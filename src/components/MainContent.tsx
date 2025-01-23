import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { NoteInput } from './NoteInput';
import { Playlist, NoteStatus } from '../types';
import { VersionSearch } from './VersionSearch';
import { ftrackService } from '../services/ftrack';
import { playlistStore } from '../store/playlistStore';
import { PlaylistModifiedBanner } from './PlaylistModifiedBanner';
import { RefreshCw } from 'lucide-react';
import { useSettings } from '../store/settingsStore';

interface MainContentProps {
  playlist: Playlist;
  onPlaylistUpdate?: (playlist: Playlist) => void;
}

interface NoteInputHandlers {
  onSave: (content: string) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({ playlist, onPlaylistUpdate }) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [modifications, setModifications] = useState<{
    added: number;
    removed: number;
    addedVersions?: string[];
    removedVersions?: string[];
  }>({ added: 0, removed: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const sortedVersions = useMemo(() => {
    return [...(playlist.versions || [])].sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      
      // Then by version number
      const versionA = parseInt(a.version);
      const versionB = parseInt(b.version);
      return versionA - versionB;
    });
  }, [playlist.versions]);

  // Initialize playlist in store and start polling
  useEffect(() => {
    playlistStore.initializePlaylist(playlist.id, playlist);
  }, [playlist]);

  useEffect(() => {
    // Start polling when component mounts
    playlistStore.startPolling(
      playlist.id,
      (added, removed, addedVersions, removedVersions) => {
        setModifications({
          added,
          removed,
          addedVersions,
          removedVersions
        });
        // Refresh the playlist data when changes are found
        handlePlaylistUpdate();
      }
    );

    // Stop polling when component unmounts or playlist changes
    return () => playlistStore.stopPolling();
  }, [playlist.id]); // Only restart polling when playlist ID changes

  // Reset selections when switching playlists
  useEffect(() => {
    setSelectedVersions([]);
  }, [playlist.id]);

  const handleNoteSave = async (versionId: string, content: string) => {
    try {
      await playlistStore.saveDraft(versionId, content);
      setNoteDrafts(prev => ({ ...prev, [versionId]: content }));
      setNoteStatuses(prev => ({ ...prev, [versionId]: 'draft' }));
    } catch (error) {
      console.error('Failed to save note:', error);
    }
  };

  const handleNoteClear = async (versionId: string) => {
    setNoteStatuses(prev => {
      const newStatuses = { ...prev };
      delete newStatuses[versionId];
      return newStatuses;
    });
    setNoteDrafts(prev => {
      const newDrafts = { ...prev };
      delete newDrafts[versionId];
      return newDrafts;
    });
    await playlistStore.saveDraft(versionId, '');
  };

  const handleClearAdded = () => {
    setNoteStatuses(prev => {
      const newStatuses = { ...prev };
      Object.keys(newStatuses).forEach(key => {
        if (newStatuses[key] === 'added') {
          delete newStatuses[key];
        }
      });
      return newStatuses;
    });
  };

  const handleClearAll = () => {
    setNoteStatuses({});
    setSelectedVersions([]);
    setNoteDrafts({});
  };

  const handlePublishSelected = async () => {
    try {
      setIsPublishing(true);
      const publishPromises = selectedVersions.map(async (versionId) => {
        const content = noteDrafts[versionId];
        if (content) {
          await ftrackService.publishNote(versionId, content);
          setNoteStatuses(prev => ({ ...prev, [versionId]: 'published' }));
        }
      });
      await Promise.all(publishPromises);
      setNoteDrafts(prev => {
        const next = { ...prev };
        selectedVersions.forEach(id => delete next[id]);
        return next;
      });
      setSelectedVersions([]);
    } catch (error) {
      console.error('Failed to publish selected notes:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishAll = async () => {
    try {
      setIsPublishing(true);
      const publishPromises = Object.entries(noteDrafts).map(async ([versionId, content]) => {
        await ftrackService.publishNote(versionId, content);
        setNoteStatuses(prev => ({ ...prev, [versionId]: 'published' }));
      });
      await Promise.all(publishPromises);
      setNoteDrafts({});
    } catch (error) {
      console.error('Failed to publish notes:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePlaylistUpdate = async () => {
    setIsRefreshing(true);
    try {
      await playlistStore.updatePlaylist(playlist.id);
      const updatedPlaylist = await playlistStore.getPlaylist(playlist.id);
      if (updatedPlaylist) {
        // Create a clean copy of the versions to avoid function references
        const cleanVersions = updatedPlaylist.versions?.map(version => ({
          id: version.id,
          name: version.name,
          version: version.version,
          reviewSessionObjectId: version.reviewSessionObjectId,
          thumbnailUrl: version.thumbnailUrl,
          createdAt: version.createdAt || new Date().toISOString(),
          updatedAt: version.updatedAt || new Date().toISOString()
        })) || [];
        
        // Update local state with clean data
        playlist.versions = cleanVersions;
        setModifications({ added: 0, removed: 0 });
      }
    } catch (error) {
      console.error('Failed to update playlist:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await handlePlaylistUpdate();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const { settings } = useSettings.getState();
    if (!settings.autoRefreshEnabled) return;

    const interval = setInterval(() => {
      handlePlaylistUpdate();
    }, 5000);

    return () => clearInterval(interval);
  }, [useSettings.getState()?.settings?.autoRefreshEnabled]);

  return (
    <Card className="h-full flex flex-col rounded-none">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <div className="flex items-center gap-2">
          <CardTitle>
            {playlist.name}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh playlist"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          {(modifications.added > 0 || modifications.removed > 0) && (
            <PlaylistModifiedBanner
              addedCount={modifications.added}
              removedCount={modifications.removed}
              onUpdate={handlePlaylistUpdate}
              isUpdating={isRefreshing}
              addedVersions={playlist.versions?.filter(v => modifications.addedVersions?.includes(v.id)) || []}
              removedVersions={playlist.versions?.filter(v => modifications.removedVersions?.includes(v.id)) || []}
            />
          )}
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handlePublishSelected()}
              disabled={selectedVersions.length === 0 || isPublishing}
            >
              Publish {selectedVersions.length} Selected
            </Button>
            <Button 
              size="sm"
              onClick={() => handlePublishAll()}
              disabled={Object.keys(noteDrafts).length === 0 || isPublishing}
            >
              Publish All Notes
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4 pb-4">
          {sortedVersions.map((version) => {
            const versionHandlers: NoteInputHandlers = {
              onSave: (content: string) => handleNoteSave(version.id, content),
              onClear: () => handleNoteClear(version.id),
              onSelectToggle: () => {
                setSelectedVersions(prev =>
                  prev.includes(version.id)
                    ? prev.filter(id => id !== version.id)
                    : [...prev, version.id]
                );
              }
            };

            return (
              <div key={version.id}>
                <NoteInput
                  versionName={version.name}
                  versionNumber={version.version}
                  thumbnailUrl={version.thumbnailUrl}
                  status={noteStatuses[version.id] || 'empty'}
                  selected={selectedVersions.includes(version.id)}
                  initialContent={noteDrafts[version.id]}
                  {...versionHandlers}
                />
              </div>
            );
          })}
          {!playlist.versions?.length && (
            <div className="text-center text-gray-500 py-8">
              {playlist.isQuickNotes 
                ? "Select a version to add notes"
                : "No versions found in this playlist"}
            </div>
          )}
        </div>
      </CardContent>

      <div className="flex-none border-t bg-white shadow-md">
        <div className="p-4">
          <VersionSearch 
            onClearAdded={handleClearAdded}
            onClearAll={handleClearAll}
          />
        </div>
      </div>
    </Card>
  );
};
