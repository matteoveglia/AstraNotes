import { demoSeed } from "@/services/mock/demoSeed";
import { tailwindTokenToHex } from "@/services/mock/tailwindColorMap";
import type { Note } from "@/types";

const sleep = async () =>
  new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180));

const notes = new Map<string, Note>(
  demoSeed.notes.map((seed) => [
    seed.id,
    {
      id: seed.id,
      content: seed.body,
      createdAt: seed.createdAt,
      updatedAt: seed.createdAt,
      versionId: seed.versionId,
      author: seed.author,
    },
  ]),
);

const noteBuckets = new Map<string, Note[]>();

const noteLabels = demoSeed.noteLabels.map((label) => ({
  id: label.id,
  name: label.name,
  color: tailwindTokenToHex(label.colorToken?.text ?? label.colorToken?.background),
}));

const rebuildBuckets = () => {
  noteBuckets.clear();
  for (const note of notes.values()) {
    const key = note.versionId ?? "";
    const current = noteBuckets.get(key) ?? [];
    noteBuckets.set(key, [...current, note]);
  }
};

rebuildBuckets();

const addToBuckets = (note: Note) => {
  const key = note.versionId ?? "";
  const current = noteBuckets.get(key) ?? [];
  noteBuckets.set(key, [...current, note]);
};

const createNote = (versionId: string, content: string, author: string): Note => {
  const timestamp = new Date().toISOString();
  return {
    id: `demo:note:${versionId}:${timestamp}`,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
    versionId,
    author,
  };
};

export const mockNoteService = {
  async publishNote(
    versionId: string,
    content: string,
    _labelId?: string,
  ): Promise<string | null> {
    await sleep();
    const note = createNote(versionId, content, "Demo Supervisor");
    notes.set(note.id, note);
    addToBuckets(note);
    return note.id;
  },
  async publishNoteWithAttachments() {
    await sleep();
    return null;
  },
  async publishNoteWithAttachmentsAPI() {
    await sleep();
    return { noteId: null };
  },
  async getNoteLabels() {
    await sleep();
    return noteLabels.map((label) => ({ ...label }));
  },
  async listNotes(versionId: string): Promise<Note[]> {
    await sleep();
    return [...(noteBuckets.get(versionId) ?? [])];
  },
};
