import type { Session } from "@ftrack/api";
import { BaseFtrackClient } from "./BaseFtrackClient";
import { AttachmentService } from "@/services/attachmentService";
import type { Attachment } from "@/components/NoteAttachments";
import type { NoteServiceContract } from "@/services/client/types";

interface Label {
	id: string;
	name: string;
	color: string;
}

export class FtrackNoteService
	extends BaseFtrackClient
	implements NoteServiceContract
{
	/* -------------------------------------------------- */
	/* helpers                                            */
	/* -------------------------------------------------- */
	private currentUserId: string | null = null;

	private async ensureCurrentUser(session: Session): Promise<string> {
		if (this.currentUserId) return this.currentUserId!;
		const username = this.getSettings()?.apiUser;
		if (!username) {
			throw new Error("No API user configured");
		}
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
		const session = await this.getSession();
		const userId = await this.ensureCurrentUser(session);

		const processedContent = content.replace(/\n/g, "\n\n");
		const response: any = await session.create("Note", {
			content: processedContent,
			parent_id: versionId,
			parent_type: "AssetVersion",
			user_id: userId,
		});

		const noteIdSimple = response?.data?.id;
		if (noteIdSimple && labelId) {
			await session.create("NoteLabelLink", {
				note_id: noteIdSimple,
				label_id: labelId,
			});
		}
		return noteIdSimple || null;
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
		const session = await this.getSession();
		const userId = await this.ensureCurrentUser(session);

		// Use the official AttachmentService helper that internally:
		// 1. uploads all attachments via session.createComponent (reliable path)
		// 2. creates the note with correct user_id association
		// 3. links componentIds to the note
		const processed = content.replace(/\n/g, "\n\n");

		const result = await AttachmentService.createNoteWithAttachmentsAPI(
			session,
			processed,
			versionId,
			"AssetVersion",
			attachments,
			userId,
		);

		const noteId = result?.noteId ?? null;

		// Handle label linking (not covered by AttachmentService)
		if (noteId && labelId) {
			try {
				await session.create("NoteLabelLink", {
					note_id: noteId,
					label_id: labelId,
				});
			} catch (err) {
				console.error("[FtrackNoteService] Failed to link label to note", err);
			}
		}

		return noteId;
	}

	async getNoteLabels(): Promise<Label[]> {
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
