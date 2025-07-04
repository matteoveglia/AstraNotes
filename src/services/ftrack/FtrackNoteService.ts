import { ftrackService } from "../ftrack";
import type { Attachment } from "@/components/NoteAttachments";

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
  async getNoteLabels() {
    return ftrackService.getNoteLabels();
  }
}

export const ftrackNoteService = new FtrackNoteService(); 