import { Playlist, Note, AssetVersion } from "../types";
import { playlistStore } from "../store/playlistStore";

interface NoteExportData {
  versionName: string;
  version: number;
  content: string;
  noteState: "Draft" | "Published";
}

type DraftNote = Omit<NoteExportData, "noteState"> & { noteState: "Draft" };
type PublishedNote = Omit<NoteExportData, "noteState"> & { noteState: "Published" };

export async function exportPlaylistNotesToCSV(playlist: Playlist): Promise<void> {
  if (!playlist) return;

  // Get all drafts for the playlist versions
  const draftsPromises = (playlist.versions || []).map(async (version) => {
    const { content } = await playlistStore.getDraftContent(version.id);
    if (content) {
      const draft: DraftNote = {
        versionName: version.name,
        version: version.version,
        content: content,
        noteState: "Draft"
      };
      return draft;
    }
    return null;
  });

  const drafts = (await Promise.all(draftsPromises)).filter(
    (draft): draft is DraftNote => draft !== null
  );

  // Format published notes
  const publishedNotes = formatNotesForExport(playlist);

  // Combine both drafts and published notes
  const allNotes: NoteExportData[] = [...publishedNotes, ...drafts];

  // Sort notes: Published first, then by version name, then by version number
  const sortedNotes = [...allNotes].sort((a, b) => {
    // First sort by note state (Published before Draft)
    if (a.noteState !== b.noteState) {
      return a.noteState === "Published" ? -1 : 1;
    }
    
    // Then sort by version name
    const nameCompare = a.versionName.localeCompare(b.versionName);
    if (nameCompare !== 0) return nameCompare;

    // Finally sort by version number
    return a.version - b.version;
  });

  const csvRows = [
    // Headers
    [
      "Version Name",
      "Version",
      "Note Content",
      "Note State"
    ].join(","),
    // Data rows
    ...sortedNotes.map(formatRowForCSV),
  ];

  // Format the date as YYYYMMDD
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');

  const filename = `${playlist.name}_${dateStr}.csv`;
  downloadCSV(csvRows.join("\n"), filename);
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
        noteState: "Published"
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
    escapeCsvField(data.noteState)
  ].join(",");
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url); // Clean up the URL object
}
