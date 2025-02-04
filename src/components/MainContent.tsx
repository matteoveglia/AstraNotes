import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { NoteInput } from "./NoteInput";
import { Playlist, NoteStatus, AssetVersion } from "../types";
import { VersionSearch } from "./VersionSearch";
import { ftrackService } from "../services/ftrack";
import { playlistStore } from "../store/playlistStore";
import { PlaylistModifiedBanner } from "./PlaylistModifiedBanner";
import { RefreshCw } from "lucide-react";
import { useSettings } from "../store/settingsStore";
import { PlaylistMenu } from "./PlaylistMenu";
import { db, type CachedVersion } from "../store/db";
import Dexie from "dexie";

interface MainContentProps {
  playlist: Playlist;
  onPlaylistUpdate?: (playlist: Playlist) => void;
}

interface NoteInputHandlers {
  onSave: (content: string, labelId: string) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({
  playlist,
  onPlaylistUpdate,
}) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<Record<string, NoteStatus>>(
    {},
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteLabelIds, setNoteLabelIds] = useState<Record<string, string>>({});
  const [modifications, setModifications] = useState<{
    added: number;
    removed: number;
    addedVersions?: string[];
    removedVersions?: string[];
  }>({ added: 0, removed: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingVersions, setPendingVersions] = useState<AssetVersion[] | null>(
    null,
  );

  const sortedVersions = useMemo(() => {
    return [...(playlist.versions || [])].sort((a, b) => {
      // First sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // Then by version number
      return a.version - b.version;
    });
  }, [playlist.versions]);

  // Initialize playlist in store and start polling
  useEffect(() => {
    const initializePlaylist = async () => {
      await playlistStore.initializePlaylist(playlist.id, playlist);
      // Reset modifications and pending versions when playlist is initialized
      setModifications({ added: 0, removed: 0 });
      setPendingVersions(null);
    };

    initializePlaylist();
  }, [playlist]);

  const { settings } = useSettings();

  useEffect(() => {
    // Don't poll for Quick Notes playlist
    if (playlist.isQuickNotes) return;

    if (!settings.autoRefreshEnabled) {
      playlistStore.stopPolling();
      return;
    }

    // Start polling when component mounts
    playlistStore.startPolling(
      playlist.id,
      (added, removed, addedVersions, removedVersions, freshVersions) => {
        if (added > 0 || removed > 0) {
          setModifications({
            added,
            removed,
            addedVersions,
            removedVersions,
          });
          // Store the fresh versions but don't apply them yet
          setPendingVersions(freshVersions || null);
        }
      },
    );

    // Stop polling when component unmounts or playlist changes
    return () => playlistStore.stopPolling();
  }, [playlist.id, playlist.isQuickNotes, settings.autoRefreshEnabled]); // Only restart polling when playlist ID, isQuickNotes, or auto-refresh setting changes

  // Reset selections when switching playlists
  useEffect(() => {
    setSelectedVersions([]);
  }, [playlist.id]);

  useEffect(() => {
    const loadDrafts = async () => {
      if (!playlist.versions) return;

      const draftsMap: Record<string, string> = {};
      const labelIdsMap: Record<string, string> = {};
      const statusMap: Record<string, NoteStatus> = {};

      // Load all drafts at once using compound index
      const drafts = await db.versions
        .where("[playlistId+id]")
        .between([playlist.id, Dexie.minKey], [playlist.id, Dexie.maxKey])
        .toArray();

      // Create maps for drafts and label IDs
      drafts.forEach((draft: CachedVersion) => {
        if (draft.draftContent) {
          draftsMap[draft.id] = draft.draftContent;
          statusMap[draft.id] =
            draft.draftContent.trim() === "" ? "empty" : "draft";
        }
        if (draft.labelId) {
          labelIdsMap[draft.id] = draft.labelId;
        }
      });

      setNoteDrafts(draftsMap);
      setNoteLabelIds(labelIdsMap);
      setNoteStatuses(statusMap);
    };

    loadDrafts();
  }, [playlist.id, playlist.versions]);

  const handleNoteSave = async (
    versionId: string,
    content: string,
    labelId: string,
  ) => {
    try {
      await playlistStore.saveDraft(versionId, playlist.id, content, labelId);

      setNoteDrafts((prev) => ({ ...prev, [versionId]: content }));
      setNoteLabelIds((prev) => ({ ...prev, [versionId]: labelId }));
      setNoteStatuses((prev) => ({
        ...prev,
        [versionId]: content.trim() === "" ? "empty" : "draft",
      }));

      // Unselect if empty
      if (content.trim() === "") {
        setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  const handleNoteClear = async (versionId: string) => {
    // Unselect the version when cleared
    setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
    setNoteStatuses((prev) => {
      const newStatuses = { ...prev };
      delete newStatuses[versionId];
      return newStatuses;
    });
    setNoteDrafts((prev) => {
      const newDrafts = { ...prev };
      delete newDrafts[versionId];
      return newDrafts;
    });
    setNoteLabelIds((prev) => {
      const newLabelIds = { ...prev };
      delete newLabelIds[versionId];
      return newLabelIds;
    });
    await playlistStore.saveDraft(versionId, playlist.id, "", "");
  };

  const handleClearAdded = () => {
    if (!playlist.versions) return;

    // Keep only non-manually added versions
    const updatedVersions = playlist.versions.filter((v) => !v.manuallyAdded);
    const updatedPlaylist = {
      ...playlist,
      versions: updatedVersions,
    };

    // Update the playlist in the store
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
    }
  };

  const handleClearAll = () => {
    if (!playlist.isQuickNotes) return;

    // Clear all versions from the playlist
    const updatedPlaylist = {
      ...playlist,
      versions: [],
    };

    // Update the playlist in the store
    if (onPlaylistUpdate) {
      onPlaylistUpdate(updatedPlaylist);
    }
  };

  const handlePublishSelected = async () => {
    try {
      setIsPublishing(true);
      const publishPromises = selectedVersions
        .filter((versionId) => {
          const content = noteDrafts[versionId];
          const status = noteStatuses[versionId];
          // Only publish non-empty drafts that haven't been published yet
          return content && content.trim() !== "" && status !== "published";
        })
        .map(async (versionId) => {
          try {
            const content = noteDrafts[versionId];
            const labelId = noteLabelIds[versionId];
            await ftrackService.publishNote(versionId, content, labelId);
            setNoteStatuses((prev) => ({ ...prev, [versionId]: "published" }));
            return { success: true, versionId };
          } catch (error) {
            console.error(
              `Failed to publish note for version ${versionId}:`,
              error,
            );
            return { success: false, versionId, error };
          }
        });

      const results = await Promise.all(publishPromises);
      const failures = results.filter((r) => !r.success);

      if (failures.length > 0) {
        console.error("Failed to publish some notes:", failures);
        throw new Error(`Failed to publish ${failures.length} notes`);
      }

      // Only clear drafts for successfully published notes
      const successfulVersions = results
        .filter((r) => r.success)
        .map((r) => r.versionId);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        successfulVersions.forEach((id) => delete next[id]);
        return next;
      });
      setNoteLabelIds((prev) => {
        const next = { ...prev };
        successfulVersions.forEach((id) => delete next[id]);
        return next;
      });
      setSelectedVersions([]);
    } catch (error) {
      console.error("Failed to publish selected notes:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishAll = async () => {
    try {
      setIsPublishing(true);

      // Only get versions from the current playlist if it exists
      const currentVersions = new Set(
        playlist?.versions?.map((v) => v.id) || [],
      );

      const publishPromises = Object.entries(noteDrafts)
        .filter(([versionId, content]) => content && content.trim() !== "") // Filter out empty notes
        .filter(([versionId]) => noteStatuses[versionId] !== "published") // Filter out already published notes
        .filter(([versionId]) => currentVersions.has(versionId)) // Only publish notes for versions in current playlist
        .map(async ([versionId, content]) => {
          try {
            const labelId = noteLabelIds[versionId];
            await ftrackService.publishNote(versionId, content, labelId);
            setNoteStatuses((prev) => ({ ...prev, [versionId]: "published" }));
            return { success: true, versionId };
          } catch (error) {
            console.error(
              `Failed to publish note for version ${versionId}:`,
              error,
            );
            return { success: false, versionId, error };
          }
        });

      const results = await Promise.all(publishPromises);
      const failures = results.filter((r) => !r.success);

      if (failures.length > 0) {
        console.error("Failed to publish some notes:", failures);
        throw new Error(`Failed to publish ${failures.length} notes`);
      }

      // Only clear drafts for successfully published notes
      const successfulVersions = results
        .filter((r) => r.success)
        .map((r) => r.versionId);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        successfulVersions.forEach((id) => delete next[id]);
        return next;
      });
      setNoteLabelIds((prev) => {
        const next = { ...prev };
        successfulVersions.forEach((id) => delete next[id]);
        return next;
      });
    } catch (error) {
      console.error("Failed to publish notes:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePlaylistUpdate = async () => {
    // Don't update Quick Notes playlist from Ftrack
    if (playlist.isQuickNotes) return;

    setIsRefreshing(true);
    try {
      // If we have pending versions, use those, otherwise fetch fresh ones
      const freshVersions =
        pendingVersions ||
        (await ftrackService.getPlaylistVersions(playlist.id));

      // Compare with current versions to find modifications
      const currentVersionIds = new Set(
        playlist.versions?.map((v) => v.id) || [],
      );
      const freshVersionIds = new Set(freshVersions.map((v) => v.id));

      const addedVersions = freshVersions
        .filter((v) => !currentVersionIds.has(v.id))
        .map((v) => v.id);

      const removedVersions = (playlist.versions || [])
        .filter((v) => !freshVersionIds.has(v.id))
        .map((v) => v.id);

      if (addedVersions.length > 0 || removedVersions.length > 0) {
        setModifications({
          added: addedVersions.length,
          removed: removedVersions.length,
          addedVersions,
          removedVersions,
        });
        // Store the fresh versions but don't apply them yet
        setPendingVersions(freshVersions);
      } else {
        // No changes found, clear any pending versions
        setPendingVersions(null);
        setModifications({ added: 0, removed: 0 });
      }
    } catch (error) {
      console.error("Failed to update playlist:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyPendingChanges = async () => {
    if (!pendingVersions) return;

    try {
      // Create a new playlist object with the pending versions
      const updatedPlaylist = {
        ...playlist,
        versions: pendingVersions,
      };

      // Update the cache first
      await playlistStore.cachePlaylist(
        playlistStore.cleanPlaylistForStorage(updatedPlaylist),
      );

      // Then notify parent components of the update
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }

      // Clear pending versions and modifications
      setPendingVersions(null);
      setModifications({ added: 0, removed: 0 });

      // Update playlist and restart polling
      await playlistStore.updatePlaylistAndRestartPolling(
        playlist.id,
        (added, removed, addedVersions, removedVersions, freshVersions) => {
          if (added > 0 || removed > 0) {
            setModifications({
              added,
              removed,
              addedVersions,
              removedVersions,
            });
            setPendingVersions(freshVersions || null);
          }
        },
      );
    } catch (error) {
      console.error("Failed to apply changes:", error);
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

  const handleVersionSelect = (version: AssetVersion) => {
    if (!playlist.versions) return;

    // Add the version to the playlist if it's not already there
    const existingVersion = playlist.versions.find((v) => v.id === version.id);
    if (!existingVersion) {
      const updatedPlaylist = {
        ...playlist,
        versions: [...playlist.versions, version],
      };

      // Update the playlist in the store
      if (onPlaylistUpdate) {
        onPlaylistUpdate(updatedPlaylist);
      }
    }
  };

  const handleClearAllNotes = async () => {
    // Get all version IDs that have draft content
    const versionIds = Object.keys(noteDrafts);

    // Clear all drafts from state
    setNoteDrafts({});
    setNoteLabelIds({});

    // Update note statuses
    const updatedStatuses = { ...noteStatuses };
    versionIds.forEach((id) => {
      delete updatedStatuses[id];
    });
    setNoteStatuses(updatedStatuses);

    // Clear drafts from the database
    try {
      await Promise.all(
        versionIds.map(async (versionId) => {
          await playlistStore.saveDraft(versionId, playlist.id, "", "");
        }),
      );
    } catch (error) {
      console.error("Failed to clear drafts from database:", error);
    }
  };

  const handleSetAllLabels = async (labelId: string) => {
    // Update all drafts with the new label
    const updatedLabelIds = { ...noteLabelIds };
    Object.keys(noteDrafts).forEach((versionId) => {
      updatedLabelIds[versionId] = labelId;
    });
    setNoteLabelIds(updatedLabelIds);

    // Save changes to database
    try {
      await Promise.all(
        Object.entries(noteDrafts).map(async ([versionId, content]) => {
          await playlistStore.saveDraft(
            versionId,
            playlist.id,
            content,
            labelId,
          );
        }),
      );
    } catch (error) {
      console.error("Failed to update labels in database:", error);
    }
  };

  const renderModificationsBanner = () => {
    if (modifications.added === 0 && modifications.removed === 0) return null;

    return (
      <PlaylistModifiedBanner
        addedCount={modifications.added}
        removedCount={modifications.removed}
        onUpdate={applyPendingChanges}
        isUpdating={isRefreshing}
        addedVersions={
          pendingVersions?.filter((v) =>
            modifications.addedVersions?.includes(v.id),
          ) || []
        }
        removedVersions={
          playlist.versions?.filter((v) =>
            modifications.removedVersions?.includes(v.id),
          ) || []
        }
      />
    );
  };

  return (
    <Card className="h-full flex flex-col rounded-none">
      <CardHeader className="flex flex-row items-center justify-between border-b flex-none">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl">{playlist.name}</CardTitle>
          {!playlist.isQuickNotes && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Refresh playlist"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {renderModificationsBanner()}
          <div className="flex items-center gap-2">
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
              <div className="ml-3 mx-1 w-px bg-foreground/20 self-stretch" />
              <PlaylistMenu
                onClearAllNotes={handleClearAllNotes}
                onSetAllLabels={handleSetAllLabels}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4 py-4">
          {sortedVersions.map((version) => {
            const versionHandlers: NoteInputHandlers = {
              onSave: (content: string, labelId: string) =>
                handleNoteSave(version.id, content, labelId),
              onClear: () => handleNoteClear(version.id),
              onSelectToggle: () => {
                setSelectedVersions((prev) =>
                  prev.includes(version.id)
                    ? prev.filter((id) => id !== version.id)
                    : [...prev, version.id],
                );
              },
            };

            return (
              <div key={version.id}>
                <NoteInput
                  versionName={version.name}
                  versionNumber={version.version.toString()}
                  thumbnailUrl={version.thumbnailUrl}
                  status={noteStatuses[version.id] || "empty"}
                  selected={selectedVersions.includes(version.id)}
                  initialContent={noteDrafts[version.id]}
                  initialLabelId={noteLabelIds[version.id]}
                  {...versionHandlers}
                />
              </div>
            );
          })}
          {!playlist.versions?.length && (
            <div className="text-center text-gray-500 py-8">
              {playlist.isQuickNotes
                ? "Search for a version below to begin"
                : "No versions found in this playlist"}
            </div>
          )}
        </div>
      </CardContent>

      <div className="flex-none border-t bg-white shadow-md">
        <div className="p-4">
          <VersionSearch
            onVersionSelect={handleVersionSelect}
            onClearAdded={handleClearAdded}
            onClearAll={handleClearAll}
            hasManuallyAddedVersions={playlist.versions?.some(
              (v) => v.manuallyAdded,
            )}
            isQuickNotes={playlist.isQuickNotes}
          />
        </div>
      </div>
    </Card>
  );
};
