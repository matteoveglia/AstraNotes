/**
 * @fileoverview exportUtils.ts
 * Utilities for exporting playlist data to CSV format.
 * Handles draft notes, published notes, and version information.
 * Includes file system integration for saving exports.
 */

import { Playlist } from "@/types";
import { playlistStore } from "../store/playlist";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";

interface NoteExportData {
  versionName: string;
  version: number;
  content: string;
  noteState: "Draft" | "Published";
}

interface DraftNote {
  versionName: string;
  versionNumber: number;
  content: string;
}

type PublishedNote = Omit<NoteExportData, "noteState"> & {
  noteState: "Published";
};

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");

  if ((navigator as any).msSaveBlob) {
    // IE 10+
    (navigator as any).msSaveBlob(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export async function exportPlaylistNotesToCSV(
  playlist: Playlist,
): Promise<void> {
  if (!playlist.versions) {
    return;
  }

  try {
    // Get all drafts for the playlist versions
    const draftsPromises = (playlist.versions || []).map(async (version) => {
      const content = await playlistStore.getDraftContent(
        playlist.id,
        version.id,
      );
      if (content) {
        const draft: DraftNote = {
          versionName: version.name,
          versionNumber: version.version,
          content: content,
        };
        return draft;
      }
      return null;
    });

    const drafts = (await Promise.all(draftsPromises)).filter(
      (draft): draft is DraftNote => draft !== null,
    );

    // Convert to CSV
    const csvRows = drafts.map(
      (draft) =>
        `"${draft.versionName}","${draft.versionNumber}","${draft.content.replace(/"/g, '""')}"`,
    );

    // Add header row
    csvRows.unshift('"Version Name","Version Number","Notes"');

    // Format the date as YYYYMMDD
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");

    const filename = `${playlist.name}_${dateStr}.csv`;

    // Get downloads directory and create file path
    const downloadsDir = await downloadDir();
    const filePath = await join(downloadsDir, filename);

    // Write the CSV file
    await writeTextFile(filePath, csvRows.join("\n"));

    console.log(`CSV file saved to: ${filePath}`);
  } catch (error) {
    console.error("Error exporting CSV:", error);
    throw error;
  }
}

function formatNotesForExport(playlist: Playlist): PublishedNote[] {
  return playlist.notes
    .map((note): PublishedNote | null => {
      const version = playlist.versions?.find((v) => v.id === note.id);
      if (!version) return null;

      const publishedNote: PublishedNote = {
        versionName: version.name,
        version: version.version,
        content: note.content,
        noteState: "Published",
      };
      return publishedNote;
    })
    .filter((note): note is PublishedNote => note !== null);
}

function formatRowForCSV(data: NoteExportData): string {
  const escapeCsvField = (field: string | number) =>
    typeof field === "string" ? `"${field.replace(/"/g, '""')}"` : field;

  return [
    escapeCsvField(data.versionName),
    data.version,
    escapeCsvField(data.content),
    escapeCsvField(data.noteState),
  ].join(",");
}
