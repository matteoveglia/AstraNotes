import { Session } from "@ftrack/api";
import { BaseFtrackClient } from "./BaseFtrackClient";
import { AttachmentService } from "@/services/attachmentService";
import { useSettings } from "@/store/settingsStore";
import type { Attachment } from "@/components/NoteAttachments";

interface Label {
  id: string;
  name: string;
  color: string;
}

export class FtrackNoteService extends BaseFtrackClient {
  /* -------------------------------------------------- */
  /* helpers                                            */
  /* -------------------------------------------------- */
  private legacy: any | null = null;

  private async getLegacy() {
    if (!this.legacy) {
      const mod = await import("../legacy/ftrack");
      this.legacy = mod.ftrackService;
    }
    return this.legacy;
  }

  private isFallback() {
    return useSettings.getState().settings.useMonolithFallback;
  }

  private currentUserId: string | null = null;

  private async ensureCurrentUser(session: Session): Promise<string> {
    if (this.currentUserId) return this.currentUserId!;
    const username = useSettings.getState().settings.apiUser;
    const result = await session.query(
      `select id from User where username is "${username}"`,
    );
    if (!result?.data?.length) {
      throw new Error("Unable to fetch current user ID");
    }
    this.currentUserId = result.data[0].id;
    return this.currentUserId!;
  }

  /* -------------------------------------------------- */
  /* API methods                                        */
  /* -------------------------------------------------- */
  async publishNote(
    versionId: string,
    content: string,
    labelId?: string,
  ): Promise<string | null> {
    if (this.isFallback()) {
      return (await this.getLegacy()).publishNote(versionId, content, labelId);
    }

    const session = await this.getSession();
    const userId = await this.ensureCurrentUser(session);

    const response: any = await session.create("Note", {
      content,
      parent_id: versionId,
      parent_type: "AssetVersion",
      author_id: userId,
      label_id: labelId || undefined,
    });

    return response?.data?.id || null;
  }

  async publishNoteWithAttachments(
    versionId: string,
    content: string,
    labelId?: string,
    attachments?: Attachment[],
  ): Promise<string | null> {
    // fallback to API path with optional attachments
    return this.publishNoteWithAttachmentsAPI(
      versionId,
      content,
      attachments || [],
      labelId,
    );
  }

  async publishNoteWithAttachmentsAPI(
    versionId: string,
    content: string,
    attachments: Attachment[],
    labelId?: string,
  ): Promise<string | null> {
    if (this.isFallback()) {
      return (await this.getLegacy()).publishNoteWithAttachmentsAPI(
        versionId,
        content,
        labelId,
        attachments,
      );
    }

    const session = await this.getSession();
    const userId = await this.ensureCurrentUser(session);

    // Create the note first
    const noteResp: any = await session.create("Note", {
      content,
      parent_id: versionId,
      parent_type: "AssetVersion",
      author_id: userId,
      label_id: labelId || undefined,
    });

    const noteId = noteResp?.data?.id;
    if (!noteId) return null;

    if (attachments?.length) {
      const componentIds: string[] = [];
      for (const att of attachments) {
        try {
          const res = await AttachmentService.uploadAttachment(session, att);
          if (res.success && res.componentId) {
            componentIds.push(res.componentId);
          }
        } catch (err) {
          console.error("[FtrackNoteService] Failed to upload attachment", err);
        }
      }
      if (componentIds.length) {
        await AttachmentService.attachComponentsToNote(session, noteId, componentIds);
      }
    }

    return noteId;
  }

  async getNoteLabels(): Promise<Label[]> {
    if (this.isFallback()) {
      return (await this.getLegacy()).getNoteLabels();
    }

    const session = await this.getSession();
    const result = await session.query("select id, name, color from NoteLabel");
    return (result?.data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    }));
  }
}

export const ftrackNoteService = new FtrackNoteService(); 