import { demoSeed } from "@/services/mock/demoSeed";
import { tailwindTokenToHex } from "@/services/mock/tailwindColorMap";
import type { NoteAttachment, NoteLabel, ShotNote } from "@/types/relatedNotes";

const latency = async () =>
  new Promise((resolve) => setTimeout(resolve, 140 + Math.random() * 220));

type DemoNoteSeed = (typeof demoSeed)["notes"][number];

const versionSeedById = new Map(
  demoSeed.assetVersions.map((version) => [version.id, version]),
);

const labelById = new Map<string, NoteLabel>(
  demoSeed.noteLabels.map((label) => [
    label.id,
    {
      id: label.id,
      name: label.name,
      color: tailwindTokenToHex(
        label.colorToken?.text ?? label.colorToken?.background,
      ),
    },
  ]),
);

const parseAuthor = (author: string) => {
  const trimmed = author.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
  const parts = withoutAt.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "Demo";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  const username = withoutAt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.+|\.+$)/g, "") || "demo.user";
  const id = `demo:user:${username}`;
  return {
    id,
    username,
    firstName,
    lastName,
  };
};

const attachments: NoteAttachment[] = [];

const cloneNote = (note: ShotNote): ShotNote => ({
  ...note,
  user: { ...note.user },
  version: { ...note.version },
  labels: note.labels.map((label) => ({ ...label })),
  attachments: note.attachments.map((attachment) => ({ ...attachment })),
});

const shotNotesByShot = new Map<string, ShotNote[]>();

const buildShotNote = (seed: DemoNoteSeed): { shot: string; note: ShotNote } | null => {
  const versionSeed = versionSeedById.get(seed.versionId);
  if (!versionSeed) {
    return null;
  }

  const shotName = versionSeed.shot;
  const label = seed.labelId ? labelById.get(seed.labelId) : undefined;
  const user = parseAuthor(seed.author);

  const shotNote: ShotNote = {
    id: seed.id,
    content: seed.body,
    createdAt: seed.createdAt,
    updatedAt: seed.createdAt,
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    version: {
      id: versionSeed.id,
      name: versionSeed.displayName,
      version: versionSeed.versionNumber,
      thumbnailId: versionSeed.componentIds[0],
    },
    labels: label ? [{ ...label }] : [],
    attachments: attachments.slice(),
  };

  return { shot: shotName, note: shotNote };
};

demoSeed.notes.forEach((noteSeed) => {
  const result = buildShotNote(noteSeed);
  if (!result) {
    return;
  }
  const existing = shotNotesByShot.get(result.shot) ?? [];
  existing.push(result.note);
  shotNotesByShot.set(result.shot, existing);
});

shotNotesByShot.forEach((notes, shot) => {
  notes.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  shotNotesByShot.set(shot, notes);
});

const extractShotName = (versionName: string): string => {
  const parts = versionName.split("_");

  if (parts.length === 0) {
    return versionName;
  }

  const [firstPart, secondPart, thirdPart] = parts;

  const isLettersOnly = (value: string | undefined) =>
    !!value && /^[A-Za-z]+$/.test(value);
  const isDigitsOnly = (value: string | undefined) =>
    !!value && /^\d+$/.test(value);

  if (
    isLettersOnly(firstPart) &&
    isDigitsOnly(secondPart) &&
    isDigitsOnly(thirdPart)
  ) {
    return `${firstPart}_${secondPart}_${thirdPart}`;
  }

  if (firstPart?.match(/^SQ\d+$/i) && secondPart?.match(/^SH\d+$/i)) {
    return `${firstPart}_${secondPart}`;
  }

  if (firstPart?.toLowerCase() === "shot" && secondPart?.match(/^\d+$/)) {
    return `${firstPart}_${secondPart}`;
  }

  if (firstPart?.match(/^[A-Z]{2,4}\d+$/i)) {
    return firstPart;
  }

  return firstPart ?? versionName;
};

export const mockRelatedNotesService = {
  extractShotName,
  async fetchNotesByShotName(shotName: string): Promise<ShotNote[]> {
    await latency();
    const notes = shotNotesByShot.get(shotName) ?? [];
    return notes.map(cloneNote);
  },
  clearCache(): void {
    // No-op for demo mode (data is static)
  },
};
