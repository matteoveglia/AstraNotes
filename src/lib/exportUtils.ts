/**
 * @fileoverview exportUtils.ts
 * Utilities for exporting playlist data to CSV format.
 * Handles draft notes, published notes, and version information.
 * Includes file system integration for saving exports.
 */

import { Playlist } from "@/types";
import { playlistStore } from "../store/playlist";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";
import { ftrackNoteService } from "@/services/ftrack/FtrackNoteService";
import { ftrackVersionService } from "@/services/ftrack/FtrackVersionService";
import MarkdownIt from "markdown-it";

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

const DEFAULT_LABEL_HEX = "#3b82f6"; // Tailwind blue-500 fallback

// Layout knobs for the per-version note cards in the PDF export. Tweak here for spacing/sizing.
const NOTE_CARD_LAYOUT = {
  titleFontSize: 12, // Font size for the version title inside each card
  noteFontSize: 10, // Base font size for note body markdown
  metaFontSize: 8, // Font size for metadata rows (Version Created / Created By)
  metaLabelGap: 4, // Horizontal spacing between metadata label and value
  contentTopOffset: 12, // Vertical breathing room between card top padding and the title
  headerToMetaGap: 20, // Distance between the bottom of the title and the first metadata line
  metaLineHeight: 11, // Line spacing used for each metadata row
  metaSeparatorGapTop: 1, // Space between the last metadata line and the separator rule
  metaSeparatorGapBottom: 10, // Space between the separator and the note content
  metaSeparatorThickness: 0.75, // Thickness of the metadata separator rule
  metaToNoteGap: 10, // Additional gap after the separator before note content begins
  noteBottomPadding: 3, // Extra slack below the note body to avoid cramped padding
  labelTopGap: 8, // Gap between the thumbnail bottom and the first label pill
  labelSpacing: 4, // Vertical spacing between stacked label pills
  statusPill: {
    fontSize: 9, // Font size used inside the Draft/Published status pill
    paddingX: 9, // Horizontal pill padding
    paddingY: 4, // Vertical pill padding
    verticalOffset: 7, // Offset to align the pill slightly above the title baseline
  },
};

function hexToRgb(hexColor: string | undefined | null): {
  r: number;
  g: number;
  b: number;
} {
  if (!hexColor) {
    return hexToRgb(DEFAULT_LABEL_HEX);
  }

  let hex = hexColor.trim();
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }

  if (!(hex.length === 4 || hex.length === 7)) {
    return hexToRgb(DEFAULT_LABEL_HEX);
  }

  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return hexToRgb(DEFAULT_LABEL_HEX);
  }

  return {
    r: r / 255,
    g: g / 255,
    b: b / 255,
  };
}

function getContrastingColor(hexColor: string | undefined | null): {
  r: number;
  g: number;
  b: number;
} {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6
    ? { r: 0, g: 0, b: 0 }
    : { r: 1, g: 1, b: 1 };
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

/**
 * Export playlist notes to a styled PDF placed in the user's Downloads folder.
 * The PDF includes:
 * - Title (playlist name)
 * - Optional summary (markdown text from user) under the title
 * - Total count of versions with notes being exported
 * - For each version that has a published note or a draft: thumbnail, name and version number,
 *   Published By / Published At, the note content, and a pill indicating Draft/Published.
 *
 * Returns the generated filename for toast display.
 */
export type ExportNoteScope = "published" | "draft" | "both";

export async function exportPlaylistNotesToPDF(
  playlist: Playlist,
  summaryMarkdown: string = "",
  scope: ExportNoteScope = "both",
): Promise<string> {
  if (!playlist.versions || playlist.versions.length === 0) {
    throw new Error("No versions in playlist");
  }

  let versionEntities: Array<{ id: string; labelId?: string }> = [];
  try {
    versionEntities = await playlistStore.getPlaylistVersions(playlist.id);
  } catch (error) {
    console.warn(
      "Failed to load playlist version metadata for PDF export:",
      error,
    );
  }

  const versionLabelIdMap = new Map<string, string | undefined>();
  versionEntities.forEach((entity) => {
    // entity.id within the store is the version ID. Ensure both value and key are strings.
    versionLabelIdMap.set(String(entity.id), entity.labelId || undefined);
  });

  const labelIdsNeeded = new Set(
    Array.from(versionLabelIdMap.values()).filter(
      (id): id is string => Boolean(id && id.trim()),
    ),
  );

  let labelCatalog: Array<{ id: string; name: string; color: string }> = [];
  if (labelIdsNeeded.size > 0) {
    try {
      labelCatalog = await ftrackNoteService.getNoteLabels();
    } catch (error) {
      console.warn("Failed to fetch note label metadata for PDF export:", error);
    }
  }
  const labelMap = new Map(labelCatalog.map((label) => [label.id, label]));

  // Build export items (prefer published content, fallback to draft content)
  const items: Array<{
    versionName: string;
    versionNumber: number;
    content: string;
    noteState: "Draft" | "Published";
    publishedBy?: string;
    publishedAt?: string;
    thumbnailBytes?: Uint8Array | null;
    frameNumber?: string;
    labels?: Array<{ id?: string; name: string; color?: string }>;
  }> = [];

  for (const version of playlist.versions) {
    // Find a published note (stored on playlist.notes with note.id matching version.id)
    const published = (playlist.notes || []).find(
      (n) => n.id === (version as any).id && n.content?.trim(),
    );

    let content = "";
    let noteState: "Draft" | "Published" | null = null;

    if (published && published.status === "published") {
      content = published.content || "";
      noteState = "Published";
    }

    // If no published content, check for drafts
    if (!content) {
      const draft = await playlistStore.getDraftContent(playlist.id, version.id);
      if (draft && draft.trim()) {
        content = draft;
        noteState = "Draft";
      }
    }

    if (!content || !noteState) continue; // Skip versions without any note

    // Created by/at from version metadata (best-effort)
    let createdBy = version.user
      ? `${version.user.firstName ?? ""} ${version.user.lastName ?? ""}`.trim() ||
        version.user.username
      : undefined;
    const publishedAt = version.createdAt || version.updatedAt;

    if (!createdBy) {
      try {
        const versionDetails = await ftrackVersionService.fetchVersionDetails(
          version.id,
        );
        createdBy = versionDetails?.publishedBy || createdBy;
      } catch (error) {
        console.warn(
          "Failed to fetch version details for Created By in PDF export:",
          error,
        );
      }
    }

    // Fetch thumbnail bytes for embedding (best-effort)
    let thumbnailBytes: Uint8Array | null = null;
    if (version.thumbnailId) {
      try {
        thumbnailBytes = await fetchThumbnailBytes(version.thumbnailId);
      } catch (e) {
        console.warn("Failed to fetch thumbnail for PDF:", e);
      }
    }

    // Extract frame number from version name or use placeholder
    const frameMatch = version.name.match(/(\d{4,})/);
    const frameNumber = frameMatch ? frameMatch[1] : "####";

    const labelId = versionLabelIdMap.get(String(version.id));
    const labels: Array<{ id?: string; name: string; color?: string }> = [];
    if (labelId) {
      const labelDetails = labelMap.get(labelId);
      if (labelDetails) {
        labels.push({
          id: labelId,
          name: labelDetails.name,
          color: labelDetails.color,
        });
      } else {
        labels.push({
          id: labelId,
          name: labelId,
        });
      }
    }

    items.push({
      versionName: version.name,
      versionNumber: Number(version.version) || 0,
      content,
      noteState,
      publishedBy: createdBy,
      publishedAt,
      thumbnailBytes,
      frameNumber,
      labels,
    });
  }

  const includedCount = items.length;
  if (includedCount === 0) {
    throw new Error("No notes to export");
  }

  // Compose PDF
  const pdf = await PDFDocument.create();
  const firstPage = pdf.addPage();
  const { width, height } = firstPage.getSize();
  const margin = 40;
  const headerHeight = 36;
  const footerHeight = 28;
  const contentTop = height - margin - headerHeight;
  const contentBottom = margin + footerHeight;
  let y = contentTop;

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  // Helpers
  const lineHeight = (size: number) => size * 1.2;
  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    options: { bold?: boolean; italic?: boolean; color?: { r: number; g: number; b: number } } = {},
  ) => {
    const font = options.bold ? fontBold : options.italic ? fontItalic : fontRegular;
    pageRef.page.drawText(text, {
      x,
      y: yPos,
      size,
      font,
      color: options.color ? rgb(options.color.r, options.color.g, options.color.b) : rgb(0, 0, 0),
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < contentBottom) {
      const p = pdf.addPage();
      const sz = p.getSize();
      pageRef.page = p;
      pageRef.width = sz.width;
      pageRef.height = sz.height;
      y = sz.height - margin - headerHeight;
    }
  };

  // Keep reference to current page updated by ensureSpace
  const pageRef = { page: firstPage, width, height } as { page: typeof firstPage; width: number; height: number };

  const drawWrappedText = (
    text: string,
    x: number,
    maxWidth: number,
    size: number,
    opts: { bold?: boolean; italic?: boolean; color?: { r: number; g: number; b: number } } = {},
  ) => {
    const words = text.split(/\s+/);
    let line = "";
    const font = opts.bold ? fontBold : opts.italic ? fontItalic : fontRegular;
    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];
      const w = font.widthOfTextAtSize(testLine, size);
      if (w > maxWidth && line) {
        ensureSpace(lineHeight(size));
        drawText(line, x, y, size, opts);
        y -= lineHeight(size);
        line = words[i];
      } else {
        line = testLine;
      }
    }
    if (line) {
      ensureSpace(lineHeight(size));
      drawText(line, x, y, size, opts);
      y -= lineHeight(size);
    }
  };

  type InlineStyle = "bold" | "italic" | "code" | { link: string };

  // Robust Markdown rendering using markdown-it tokens
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

  const drawInlineTokens = (
    tokens: any[],
    x: number,
    maxWidth: number,
    baseSize: number,
  ) => {
    let styleStack: InlineStyle[] = [];

    interface Segment {
      text: string;
      font: typeof fontRegular;
      size: number;
      color: { r: number; g: number; b: number };
    }

    const hasStyle = (style: "bold" | "italic" | "code") =>
      styleStack.some((s) => typeof s === "string" && s === style);

    const selectFont = (): typeof fontRegular => {
      if (hasStyle("code")) {
        return fontMono;
      }
      if (hasStyle("bold")) {
        return fontBold;
      }
      if (hasStyle("italic")) {
        return fontItalic;
      }
      return fontRegular;
    };

    const selectSize = () => (hasStyle("code") ? baseSize - 1 : baseSize);

    const selectColor = () => {
      const linkStyle = styleStack.find((s) => typeof s === "object") as
        | { link: string }
        | undefined;
      return linkStyle ? { r: 0.16, g: 0.35, b: 0.75 } : { r: 0, g: 0, b: 0 };
    };

    let buffer: Segment[] = [];
    let bufferWidth = 0;

    const flushBuffer = () => {
      if (buffer.length === 0) return;
      const maxSize = buffer.reduce((max, seg) => Math.max(max, seg.size), baseSize);
      ensureSpace(lineHeight(maxSize));

      let offset = 0;
      for (const seg of buffer) {
        pageRef.page.drawText(seg.text, {
          x: x + offset,
          y,
          size: seg.size,
          font: seg.font,
          color: rgb(seg.color.r, seg.color.g, seg.color.b),
        });
        offset += seg.font.widthOfTextAtSize(seg.text, seg.size);
      }

      y -= lineHeight(maxSize);
      buffer = [];
      bufferWidth = 0;
    };

    const pushText = (text: string) => {
      if (!text) return;
      const font = selectFont();
      const size = selectSize();
      const color = selectColor();
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (part === "\n") {
          flushBuffer();
          continue;
        }
        const width = font.widthOfTextAtSize(part, size);
        if (bufferWidth + width > maxWidth && buffer.length > 0) {
          flushBuffer();
        }
        buffer.push({ text: part, font, size, color });
        bufferWidth += width;
      }
    };

    for (const token of tokens) {
      switch (token.type) {
        case "text":
          pushText(token.content);
          break;
        case "softbreak":
        case "hardbreak":
          pushText("\n");
          break;
        case "strong_open":
          styleStack.push("bold");
          break;
        case "strong_close":
          styleStack = styleStack.filter((s) => s !== "bold");
          break;
        case "em_open":
          styleStack.push("italic");
          break;
        case "em_close":
          styleStack = styleStack.filter((s) => s !== "italic");
          break;
        case "code_inline":
          pushText(token.content);
          break;
        case "link_open": {
          const href = (token.attrs || []).find((a: any) => a[0] === "href")?.[1] ?? "";
          styleStack.push({ link: href });
          break;
        }
        case "link_close":
          styleStack = styleStack.filter((s) => typeof s !== "object");
          break;
        default:
          break;
      }
    }

    flushBuffer();
  };

  const measureInlineTokens = (
    tokens: any[],
    maxWidth: number,
    baseSize: number,
  ): number => {
    if (!tokens || tokens.length === 0) return 0;

    let styleStack: InlineStyle[] = [];
    let bufferWidth = 0;
    let height = 0;
    let buffer: Array<{ width: number; size: number }> = [];

    const hasStyle = (style: "bold" | "italic" | "code") =>
      styleStack.some((s) => typeof s === "string" && s === style);

    const currentFont = (): typeof fontRegular => {
      if (hasStyle("code")) return fontMono;
      if (hasStyle("bold")) return fontBold;
      if (hasStyle("italic")) return fontItalic;
      return fontRegular;
    };

    const currentSize = () => (hasStyle("code") ? baseSize - 1 : baseSize);

    const flush = () => {
      if (buffer.length === 0) {
        return;
      }
      const lineMax = buffer.reduce(
        (max, segment) => Math.max(max, segment.size),
        baseSize,
      );
      height += lineHeight(lineMax);
      buffer = [];
      bufferWidth = 0;
    };

    const pushText = (text: string) => {
      if (!text) return;
      const font = currentFont();
      const size = currentSize();
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (part === "\n") {
          flush();
          continue;
        }
        const width = font.widthOfTextAtSize(part, size);
        if (bufferWidth + width > maxWidth && buffer.length > 0) {
          flush();
        }
        buffer.push({ width, size });
        bufferWidth += width;
      }
    };

    for (const token of tokens) {
      switch (token.type) {
        case "text":
          pushText(token.content);
          break;
        case "softbreak":
        case "hardbreak":
          flush();
          break;
        case "strong_open":
          styleStack.push("bold");
          break;
        case "strong_close":
          styleStack = styleStack.filter((s) => s !== "bold");
          break;
        case "em_open":
          styleStack.push("italic");
          break;
        case "em_close":
          styleStack = styleStack.filter((s) => s !== "italic");
          break;
        case "code_inline":
          styleStack.push("code");
          pushText(token.content);
          styleStack = styleStack.filter((s) => s !== "code");
          break;
        case "link_open": {
          const href = (token.attrs || []).find((a: any) => a[0] === "href")?.[1] ?? "";
          styleStack.push({ link: href });
          break;
        }
        case "link_close":
          styleStack = styleStack.filter((s) => typeof s !== "object");
          break;
        default:
          break;
      }
    }

    flush();
    return height;
  };

  const drawMarkdown = (
    markdown: string,
    x: number,
    maxWidth: number,
    baseSize: number = 12,
  ) => {
    const tokens = md.parse(markdown, {});
    const listStack: Array<{
      indent: number;
      ordered: boolean;
      index: number;
      start: number;
    }> = [];

    const totalIndent = () =>
      listStack.reduce((acc, item) => acc + item.indent, 0);

    const getOrderedListStart = (token: any) => {
      const attrs = token.attrs || [];
      const found = attrs.find((attr: any) => attr[0] === "start")?.[1];
      if (found && !Number.isNaN(Number(found))) {
        return Number(found);
      }
      if (typeof token.meta?.start === "number") {
        return token.meta.start;
      }
      return 1;
    };

    for (let i = 0; i < tokens.length; i++) {
      const t: any = tokens[i];
      switch (t.type) {
        case "heading_open": {
          const level = Number(t.tag.replace("h", ""));
          const content = tokens[i + 1]?.content ?? "";
          const size =
            level === 1
              ? baseSize + 6
              : level === 2
                ? baseSize + 3
                : baseSize + 1;
          ensureSpace(lineHeight(size));
          drawText(content, x, y, size, { bold: true });
          y -= lineHeight(size) + 6;
          while (i < tokens.length && tokens[i].type !== "heading_close") i++;
          break;
        }
        case "paragraph_open": {
          const inline = tokens[i + 1];
          if (inline && inline.type === "inline") {
            drawInlineTokens(inline.children || [], x, maxWidth, baseSize);
          }
          while (i < tokens.length && tokens[i].type !== "paragraph_close") i++;
          y -= 4;
          break;
        }
        case "bullet_list_open": {
          listStack.push({ indent: 18, ordered: false, index: 0, start: 1 });
          break;
        }
        case "ordered_list_open": {
          const start = getOrderedListStart(t);
          listStack.push({ indent: 22, ordered: true, index: 0, start });
          break;
        }
        case "bullet_list_close":
        case "ordered_list_close": {
          listStack.pop();
          y -= 6;
          break;
        }
        case "list_item_open": {
          const currentList = listStack[listStack.length - 1];
          const indentOffset = totalIndent();
          const markerX = x + indentOffset - 12;
          const contentX = x + indentOffset + 6;
          const availableWidth = Math.max(60, maxWidth - (contentX - x));

          ensureSpace(lineHeight(baseSize));

          const markerText = currentList?.ordered
            ? `${currentList.start + currentList.index}.`
            : "-";
          pageRef.page.drawText(markerText, {
            x: markerX,
            y,
            size: baseSize,
            font: fontBold,
          });

          let inlineToken: any | undefined;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === "inline") {
              inlineToken = tokens[j];
              break;
            }
            if (tokens[j].type === "list_item_close") {
              break;
            }
          }

          if (inlineToken) {
            drawInlineTokens(
              inlineToken.children || [],
              contentX,
              availableWidth,
              baseSize,
            );
          }

          while (i < tokens.length && tokens[i].type !== "list_item_close") i++;
          if (currentList) {
            currentList.index += 1;
          }
          y -= 2;
          break;
        }
        case "fence":
        case "code_block": {
          const code = t.content.replace(/\n$/, "");
          const lines = code.split("\n");
          for (const ln of lines) {
            ensureSpace(lineHeight(baseSize));
            pageRef.page.drawText(ln, {
              x,
              y,
              size: baseSize - 1,
              font: fontMono,
              color: rgb(0.15, 0.15, 0.15),
            });
            y -= lineHeight(baseSize);
          }
          y -= 6;
          break;
        }
        case "hr": {
          ensureSpace(16);
          pageRef.page.drawLine({
            start: { x, y },
            end: { x: x + maxWidth, y },
            thickness: 1,
            color: rgb(0.7, 0.7, 0.7),
          });
          y -= 12;
          break;
        }
        case "blockquote_open": {
          const barX = x;
          const innerX = x + 10;
          pageRef.page.drawRectangle({
            x: barX,
            y: y - 4,
            width: 3,
            height: 14,
            color: rgb(0.8, 0.8, 0.8),
          });
          const inline = tokens[i + 1];
          if (inline && inline.type === "inline") {
            drawInlineTokens(inline.children || [], innerX, maxWidth - 10, baseSize);
          }
          while (i < tokens.length && tokens[i].type !== "blockquote_close") i++;
          y -= 6;
          break;
        }
        default:
          break;
      }
    }
  };

  const measureMarkdownHeight = (
    markdown: string,
    maxWidth: number,
    baseSize: number = 12,
  ): number => {
    if (!markdown || !markdown.trim()) {
      return 0;
    }

    const tokens = md.parse(markdown, {});
    const listStack: Array<{
      indent: number;
      ordered: boolean;
      index: number;
      start: number;
    }> = [];

    const totalIndent = () =>
      listStack.reduce((acc, item) => acc + item.indent, 0);

    const getOrderedStart = (token: any) => {
      const attrs = token.attrs || [];
      const found = attrs.find((attr: any) => attr[0] === "start")?.[1];
      if (found && !Number.isNaN(Number(found))) {
        return Number(found);
      }
      if (typeof token.meta?.start === "number") {
        return token.meta.start;
      }
      return 1;
    };

    let height = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t: any = tokens[i];
      switch (t.type) {
        case "heading_open": {
          const level = Number(t.tag.replace("h", ""));
          const size =
            level === 1
              ? baseSize + 6
              : level === 2
                ? baseSize + 3
                : baseSize + 1;
          height += lineHeight(size) + 6;
          while (i < tokens.length && tokens[i].type !== "heading_close") i++;
          break;
        }
        case "paragraph_open": {
          const inline = tokens[i + 1];
          if (inline && inline.type === "inline") {
            height += measureInlineTokens(
              inline.children || [],
              maxWidth,
              baseSize,
            );
          }
          while (i < tokens.length && tokens[i].type !== "paragraph_close") i++;
          height += 4;
          break;
        }
        case "bullet_list_open": {
          listStack.push({ indent: 18, ordered: false, index: 0, start: 1 });
          break;
        }
        case "ordered_list_open": {
          const start = getOrderedStart(t);
          listStack.push({ indent: 22, ordered: true, index: 0, start });
          break;
        }
        case "bullet_list_close":
        case "ordered_list_close": {
          listStack.pop();
          height += 6;
          break;
        }
        case "list_item_open": {
          const currentList = listStack[listStack.length - 1];
          const indentOffset = totalIndent();
          const availableWidth = Math.max(60, maxWidth - (indentOffset + 6));
          let inlineToken: any | undefined;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === "inline") {
              inlineToken = tokens[j];
              break;
            }
            if (tokens[j].type === "list_item_close") {
              break;
            }
          }

          let inlineHeight = 0;
          if (inlineToken) {
            inlineHeight = measureInlineTokens(
              inlineToken.children || [],
              availableWidth,
              baseSize,
            );
          }

          if (inlineHeight === 0) {
            inlineHeight = lineHeight(baseSize);
          }

          height += inlineHeight + 2;

          while (i < tokens.length && tokens[i].type !== "list_item_close") i++;
          if (currentList) {
            currentList.index += 1;
          }
          break;
        }
        case "fence":
        case "code_block": {
          const code = t.content.replace(/\n$/, "");
          const lines = code.split("\n");
          height += lines.length * lineHeight(baseSize) + 6;
          break;
        }
        case "hr": {
          height += 12;
          break;
        }
        case "blockquote_open": {
          const inline = tokens[i + 1];
          if (inline && inline.type === "inline") {
            height += measureInlineTokens(
              inline.children || [],
              Math.max(0, maxWidth - 10),
              baseSize,
            );
          }
          while (i < tokens.length && tokens[i].type !== "blockquote_close") i++;
          height += 6;
          break;
        }
        default:
          break;
      }
    }

    return height;
  };

  const drawStatusPill = (
    label: "Draft" | "Published",
    x: number,
    topY: number,
    fontSize: number = NOTE_CARD_LAYOUT.statusPill.fontSize,
    paddingX: number = NOTE_CARD_LAYOUT.statusPill.paddingX,
    paddingY: number = NOTE_CARD_LAYOUT.statusPill.paddingY,
  ) => {
    const textWidth = fontBold.widthOfTextAtSize(label, fontSize);
    const width = textWidth + paddingX * 2;
    const height = fontSize + paddingY * 2;
    const radius = height / 2;
    const bg = label === "Published" ? rgb(0.2, 0.65, 0.3) : rgb(0.95, 0.76, 0.1);

    const centerY = topY - radius;
    const bottomY = topY - height;
    const textBaseline = topY - paddingY - fontSize + 1; // Slight tweak keeps text visually centered

    pageRef.page.drawCircle({
      x: x + radius,
      y: centerY,
      size: radius,
      color: bg,
    });

    pageRef.page.drawCircle({
      x: x + width - radius,
      y: centerY,
      size: radius,
      color: bg,
    });

    pageRef.page.drawRectangle({
      x: x + radius,
      y: bottomY,
      width: width - radius * 2,
      height: height,
      color: bg,
    });

    pageRef.page.drawText(label, {
      x: x + paddingX,
      y: textBaseline,
      size: fontSize,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    return width;
  };

  // Section Header
  ensureSpace(40);
  drawText("NOTE SUMMARY", margin, y, 24, { bold: true });
  y -= lineHeight(18);
  drawText(`PLAYLIST: ${playlist.name}`, margin, y, 14, { bold: true });
  y -= 10;
  pageRef.page.drawLine({ start: { x: margin, y }, end: { x: pageRef.width - margin, y }, thickness: 2, color: rgb(0,0,0) });
  y -= 16;

  // General Notes
  ensureSpace(lineHeight(12));
  drawText("General Notes:", margin, y, 12, { bold: true });
  y -= lineHeight(12) + 4;
  if (summaryMarkdown && summaryMarkdown.trim()) {
    drawMarkdown(summaryMarkdown, margin, pageRef.width - margin * 2, 10); // Smaller text size
    y -= 8; // Extra spacing after summary
  } else {
    ensureSpace(lineHeight(10));
    y -= lineHeight(10);
  }
  // Separator
  ensureSpace(16);
  pageRef.page.drawLine({ start: { x: margin, y }, end: { x: pageRef.width - margin, y }, thickness: 2, color: rgb(0,0,0) });
  y -= 16;

  // Meta line: count
  ensureSpace(lineHeight(12));
  const versionLabel = includedCount === 1 ? "Version" : "Versions";
  drawText(`${includedCount} ${versionLabel}`, margin, y, 12, { italic: true, color: { r: 0.4, g: 0.4, b: 0.4 } });
  y -= 12;

  // Separator
  pageRef.page.drawLine({
    start: { x: margin, y },
    end: { x: pageRef.width - margin, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 12;

  // Entries
  for (const item of items) {
    if (scope === "published" && item.noteState !== "Published") continue;
    if (scope === "draft" && item.noteState !== "Draft") continue;

    const cardPadding = 16;
    const cardX = margin;
    const cardW = pageRef.width - margin * 2;
    const thumbW = 120;
    const thumbH = 80; // Fixed aspect ratio for consistency
    const hasThumbnail = Boolean(item.thumbnailBytes);
    const labelsCount = item.labels?.length ?? 0;
    const pillHeight = 18; // Keep pill height fixed for consistency
    const labelsBlockHeight =
      labelsCount > 0
        ? NOTE_CARD_LAYOUT.labelTopGap +
          labelsCount * pillHeight +
          (labelsCount - 1) * NOTE_CARD_LAYOUT.labelSpacing
        : 0;
    const leftColumnHeight = (hasThumbnail ? thumbH : 0) + labelsBlockHeight;

    const leftXBase = cardX + cardPadding;
    const contentXBase = hasThumbnail ? leftXBase + thumbW + 20 : leftXBase;
    const noteContentWidth = Math.max(
      60,
      cardX + cardW - cardPadding - contentXBase,
    );

    const metaLines: string[] = [];
    if (item.publishedAt) {
      metaLines.push(
        `Version Created: ${new Date(item.publishedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`,
      );
    }
    if (item.publishedBy) {
      metaLines.push(`Created By: ${item.publishedBy}`);
    }


    const headerHeight =
      NOTE_CARD_LAYOUT.contentTopOffset +
      NOTE_CARD_LAYOUT.titleFontSize +
      NOTE_CARD_LAYOUT.headerToMetaGap; // Title height plus configurable gap before metadata
    const metaHeight = metaLines.length * NOTE_CARD_LAYOUT.metaLineHeight;
    const noteHeight = Math.max(
      measureMarkdownHeight(item.content, noteContentWidth, 11),
      lineHeight(11),
    );
    const metaSpacing =
      metaLines.length > 0
        ? NOTE_CARD_LAYOUT.metaSeparatorGapTop +
          NOTE_CARD_LAYOUT.metaSeparatorGapBottom +
          NOTE_CARD_LAYOUT.metaToNoteGap
        : NOTE_CARD_LAYOUT.metaToNoteGap;
    const rightColumnHeight =
      headerHeight +
      metaHeight +
      metaSpacing +
      noteHeight +
      NOTE_CARD_LAYOUT.noteBottomPadding;

    const contentHeight = Math.max(leftColumnHeight, rightColumnHeight);
    const cardH = contentHeight + cardPadding * 2;

    ensureSpace(cardH + 16);
    const cardTopY = y;

    // Draw card background with rounded corners
    const cornerRadius = 8;
    
    // Main rectangle
    pageRef.page.drawRectangle({
      x: cardX + cornerRadius,
      y: y - cardH,
      width: cardW - cornerRadius * 2,
      height: cardH,
      color: rgb(0.96, 0.96, 0.96),
    });
    
    // Top and bottom rectangles
    pageRef.page.drawRectangle({
      x: cardX,
      y: y - cardH + cornerRadius,
      width: cardW,
      height: cardH - cornerRadius * 2,
      color: rgb(0.96, 0.96, 0.96),
    });
    
    // Corner circles
    pageRef.page.drawCircle({
      x: cardX + cornerRadius,
      y: y - cornerRadius,
      size: cornerRadius,
      color: rgb(0.96, 0.96, 0.96),
    });
    pageRef.page.drawCircle({
      x: cardX + cardW - cornerRadius,
      y: y - cornerRadius,
      size: cornerRadius,
      color: rgb(0.96, 0.96, 0.96),
    });
    pageRef.page.drawCircle({
      x: cardX + cornerRadius,
      y: y - cardH + cornerRadius,
      size: cornerRadius,
      color: rgb(0.96, 0.96, 0.96),
    });
    pageRef.page.drawCircle({
      x: cardX + cardW - cornerRadius,
      y: y - cardH + cornerRadius,
      size: cornerRadius,
      color: rgb(0.96, 0.96, 0.96),
    });
    
    let leftX = leftXBase;
    let contentX = contentXBase;
    
    // Draw thumbnail if present
    if (item.thumbnailBytes) {
      try {
        const jpg = await pdf.embedJpg(item.thumbnailBytes);
        pageRef.page.drawImage(jpg, {
          x: leftX,
          y: y - cardPadding - thumbH,
          width: thumbW,
          height: thumbH,
        });
      } catch (e) {
        console.warn("Failed to embed thumbnail in PDF:", e);
      }
    }

    // Draw label pills beneath thumbnail (supports multiple labels)
    if (item.labels && item.labels.length > 0) {
      let labelY =
        y - cardPadding - thumbH - NOTE_CARD_LAYOUT.labelTopGap;
      const baseX = leftX;
      for (const label of item.labels) {
        const text = label.name || label.id || "Label";
        const pillHeight = 18;
        const paddingX = 8;
        const textWidth = fontBold.widthOfTextAtSize(text, 9);
        const pillWidth = textWidth + paddingX * 2;
        const pillColor = label.color || "#3b82f6";

        const { r, g, b } = hexToRgb(pillColor);
        const textColor = getContrastingColor(pillColor);

        // Draw rounded pill
        const radius = pillHeight / 2;
        const pillCenterY = labelY - radius;
        
        pageRef.page.drawCircle({
          x: baseX + radius,
          y: pillCenterY,
          size: radius,
          color: rgb(r, g, b),
        });
        pageRef.page.drawCircle({
          x: baseX + pillWidth - radius,
          y: pillCenterY,
          size: radius,
          color: rgb(r, g, b),
        });
        pageRef.page.drawRectangle({
          x: baseX + radius,
          y: labelY - pillHeight,
          width: pillWidth - radius * 2,
          height: pillHeight,
          color: rgb(r, g, b),
        });

        const { r: tr, g: tg, b: tb } = textColor;
        // Center text vertically in pill
        const textY = labelY - pillHeight / 2 - 3;
        pageRef.page.drawText(text, {
          x: baseX + paddingX,
          y: textY,
          size: 9,
          font: fontBold,
          color: rgb(tr, tg, tb),
        });

        labelY -= pillHeight + NOTE_CARD_LAYOUT.labelSpacing; // Configurable spacing between stacked pills
      }
    }

    if (item.thumbnailBytes) {
      contentX = leftX + thumbW + 20;
    }
    
    // Header section - align with top of thumbnail with configurable offset
    let innerY = y - cardPadding - NOTE_CARD_LAYOUT.contentTopOffset;
    drawText(
      `${item.versionName} - v${item.versionNumber}`,
      contentX,
      innerY,
      NOTE_CARD_LAYOUT.titleFontSize,
      { bold: true },
    );

    // Status pill on the right (top right justified)
    const pillFontSize = NOTE_CARD_LAYOUT.statusPill.fontSize;
    const pillWidth =
      fontBold.widthOfTextAtSize(item.noteState, pillFontSize) +
      NOTE_CARD_LAYOUT.statusPill.paddingX * 2;
    const pillX = cardX + cardW - cardPadding - pillWidth;
    drawStatusPill(
      item.noteState,
      pillX,
      innerY + NOTE_CARD_LAYOUT.statusPill.verticalOffset,
      pillFontSize,
      NOTE_CARD_LAYOUT.statusPill.paddingX,
      NOTE_CARD_LAYOUT.statusPill.paddingY,
    );

    innerY -= NOTE_CARD_LAYOUT.headerToMetaGap;
    
    // Meta information
    if (metaLines.length > 0) {
      for (const ml of metaLines) {
        const [label, value] = ml.split(": ");
        const metaFontSize = NOTE_CARD_LAYOUT.metaFontSize;
        const labelText = label ? `${label}:` : "";
        const labelWidth = fontBold.widthOfTextAtSize(labelText, metaFontSize);

        pageRef.page.drawText(labelText, {
          x: contentX,
          y: innerY,
          size: metaFontSize,
          font: fontBold,
          color: rgb(0.4, 0.4, 0.4),
        });

        if (value) {
          pageRef.page.drawText(value, {
            x: contentX + labelWidth + NOTE_CARD_LAYOUT.metaLabelGap,
            y: innerY,
            size: metaFontSize,
            font: fontItalic,
            color: rgb(0.4, 0.4, 0.4),
          });
        }

        innerY -= NOTE_CARD_LAYOUT.metaLineHeight;
      }

      innerY -= NOTE_CARD_LAYOUT.metaSeparatorGapTop;
      const separatorY = innerY;
      pageRef.page.drawLine({
        start: { x: contentX, y: separatorY },
        end: { x: cardX + cardW - cardPadding, y: separatorY },
        thickness: NOTE_CARD_LAYOUT.metaSeparatorThickness,
        color: rgb(0.6, 0.6, 0.6),
      });
      innerY -= NOTE_CARD_LAYOUT.metaSeparatorGapBottom;
    }

    innerY -= NOTE_CARD_LAYOUT.metaToNoteGap;

    // Note content
    const previousY = y;
    y = innerY;
    drawMarkdown(
      item.content,
      contentX,
      cardX + cardW - cardPadding - contentX,
      NOTE_CARD_LAYOUT.noteFontSize,
    );
    const renderedNoteBottom = y - NOTE_CARD_LAYOUT.noteBottomPadding;
    y = previousY;

    // Move cursor past this card plus gutter spacing
    y = Math.min(renderedNoteBottom, cardTopY - cardH) - 16;
  }

  // Save file
  const today = new Date();
  const dateStr =
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");
  const filename = `${playlist.name}_${dateStr}.pdf`;
  const downloads = await downloadDir();
  const filePath = await join(downloads, filename);
  // After content: add headers/footers on each page
  const pages = pdf.getPages();
  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const sz = p.getSize();
    const headerYAbs = sz.height - margin - 10;
    const footerYAbs = margin - 6;
    // Header: Page X of Y on top-right
    const headerText = `Page ${i + 1} of ${total}`;
    const headerFontSize = 10;
    const headerWidth = fontRegular.widthOfTextAtSize(headerText, headerFontSize);
    p.drawText(headerText, { x: sz.width - margin - headerWidth, y: headerYAbs, size: headerFontSize, font: fontRegular, color: rgb(0,0,0) });
    // Footer: playlist title italic gray on bottom-left
    const footerText = playlist.name;
    p.drawText(footerText, { x: margin, y: footerYAbs, size: 10, font: fontItalic, color: rgb(0.5, 0.5, 0.5) });
  }

  const pdfBytes = await pdf.save();
  await writeFile(filePath, pdfBytes);

  return filename;
}

// Helper to fetch thumbnail bytes (JPEG) via ftrack session using Tauri HTTP
async function fetchThumbnailBytes(componentId: string): Promise<Uint8Array> {
  const session = await ftrackAuthService.getSession();
  const url = session.thumbnailUrl(componentId, { size: 256 });
  const res = await httpFetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch thumbnail: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
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
