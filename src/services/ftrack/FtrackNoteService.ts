import { ftrackService } from "../legacy/ftrack";
import type { Attachment } from "@/components/NoteAttachments";

interface Label {
  id: string;
  name: string;
  color: string;
}

export class FtrackNoteService {
  /**
   * Publish a simple text note to an AssetVersion in ftrack.
   */
  async publishNote(
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<string | null> {
    return ftrackService.publishNote(versionId, content, labelId);
  }

  /**
   * Publish a note that may include attachments. Convenience method that chooses
   * the best implementation depending on environment.
   */
  async publishNoteWithAttachments(
    versionId: string,
    content: string,
    labelId?: string,
    attachments?: Attachment[],
  ): Promise<string | null> {
    return ftrackService.publishNoteWithAttachments(
      versionId,
      content,
      labelId,
      attachments,
    );
  }

  /**
   * Get available note labels (cached by the underlying service).
   */
  async getNoteLabels(): Promise<Label[]> {
    return ftrackService.getNoteLabels();
  }

  /**
   * Publish a note with attachments using the API.
   */
  async publishNoteWithAttachmentsAPI(
    versionId: string,
    content: string,
    attachments: any[],
    labelId?: string,
  ): Promise<string | null> {
    return ftrackService.publishNoteWithAttachmentsAPI(
      versionId,
      content,
      labelId || "",
      attachments,
    );
  }
}

export const ftrackNoteService = new FtrackNoteService(); 