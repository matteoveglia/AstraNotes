import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { NoteInput } from './NoteInput';
import { Playlist, NoteStatus } from '../types';
import { VersionSearch } from './VersionSearch';
import { ftrackService } from '../services/ftrack';

interface MainContentProps {
  playlist: Playlist;
}

interface NoteInputHandlers {
  onSave: (content: string) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({ playlist }) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Reset selections when switching playlists
  useEffect(() => {
    setSelectedVersions([]);
  }, [playlist.id]);

  const handleNoteSave = (versionId: string, content: string) => {
    setNoteStatuses(prev => ({
      ...prev,
      [versionId]: 'draft'
    }));
    setNoteDrafts(prev => ({
      ...prev,
      [versionId]: content
    }));
  };

  const handleNoteClear = (versionId: string) => {
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
      for (const versionId of selectedVersions) {
        const content = noteDrafts[versionId];
        if (content) {
          await ftrackService.publishNote(versionId, content);
          setNoteStatuses(prev => ({
            ...prev,
            [versionId]: 'published'
          }));
        }
      }
      setSelectedVersions([]);
    } catch (error) {
      console.error('Failed to publish notes:', error);
      // TODO: Show error toast
    }
  };

  const handlePublishAll = async () => {
    try {
      const draftVersionIds = Object.keys(noteDrafts);
      for (const versionId of draftVersionIds) {
        const content = noteDrafts[versionId];
        if (content) {
          await ftrackService.publishNote(versionId, content);
          setNoteStatuses(prev => ({
            ...prev,
            [versionId]: 'published'
          }));
        }
      }
      setSelectedVersions([]);
      setNoteDrafts({});
    } catch (error) {
      console.error('Failed to publish notes:', error);
      // TODO: Show error toast
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <CardTitle>
          {playlist.name}
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => handlePublishSelected()}
            disabled={selectedVersions.length === 0}
          >
            Publish {selectedVersions.length} Selected
          </Button>
          <Button 
            size="sm"
            onClick={() => handlePublishAll()}
            disabled={Object.keys(noteDrafts).length === 0}
          >
            Publish All Notes
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4 pb-4">
          {playlist.versions?.map((version) => {
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
