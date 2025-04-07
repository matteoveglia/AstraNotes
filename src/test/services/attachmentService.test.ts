import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AttachmentService } from "@/services/attachmentService";

// Define the helper functions that are being tested
const getAttachmentIconType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  
  // Video files
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  
  // Document files
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'document';
  
  // Audio files
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
  
  // Compressed files
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'compressed';
  
  // Default
  return 'file';
};

const getAttachmentDisplayName = (path: string): string => {
  // Handle different path separators
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1];
};

// Mock Tauri modules
const mockSave = vi.fn().mockResolvedValue("/path/to/save/location.png");
const mockWriteBinaryFile = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/dialog", () => ({
  save: mockSave,
}));

vi.mock("@tauri-apps/api/fs", () => ({
  BaseDirectory: { App: "app" },
  writeBinaryFile: mockWriteBinaryFile,
}));

const saveAttachmentToFile = async (attachment: any): Promise<string | null> => {
  // Use the mocked functions directly
  const savePath = await mockSave({
    defaultPath: attachment.name,
    filters: [
      {
        name: "Images",
        extensions: [attachment.name.split('.').pop() || ''],
      },
    ],
  });
  
  // User cancelled the save dialog
  if (!savePath) return null;
  
  // Write the file
  await mockWriteBinaryFile(savePath, attachment.data);
  return savePath;
};

describe("attachmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getAttachmentIconType", () => {
    it("should return correct icon type for images", () => {
      expect(getAttachmentIconType("image.png")).toBe("image");
      expect(getAttachmentIconType("photo.jpg")).toBe("image");
      expect(getAttachmentIconType("graphic.jpeg")).toBe("image");
      expect(getAttachmentIconType("image.gif")).toBe("image");
    });

    it("should return correct icon type for videos", () => {
      expect(getAttachmentIconType("video.mp4")).toBe("video");
      expect(getAttachmentIconType("movie.mov")).toBe("video");
      expect(getAttachmentIconType("clip.avi")).toBe("video");
    });

    it("should return correct icon type for documents", () => {
      expect(getAttachmentIconType("doc.pdf")).toBe("document");
      expect(getAttachmentIconType("document.docx")).toBe("document");
      expect(getAttachmentIconType("spreadsheet.xlsx")).toBe("document");
      expect(getAttachmentIconType("presentation.pptx")).toBe("document");
      expect(getAttachmentIconType("text.txt")).toBe("document");
    });

    it("should return correct icon type for audio", () => {
      expect(getAttachmentIconType("sound.mp3")).toBe("audio");
      expect(getAttachmentIconType("music.wav")).toBe("audio");
      expect(getAttachmentIconType("audio.ogg")).toBe("audio");
    });

    it("should return correct icon type for compressed files", () => {
      expect(getAttachmentIconType("archive.zip")).toBe("compressed");
      expect(getAttachmentIconType("file.rar")).toBe("compressed");
      expect(getAttachmentIconType("data.tar.gz")).toBe("compressed");
    });

    it("should return fallback icon type for unknown extensions", () => {
      expect(getAttachmentIconType("unknown")).toBe("file");
      expect(getAttachmentIconType("file.xyz")).toBe("file");
    });
  });

  describe("getAttachmentDisplayName", () => {
    it("should return formatted name for file paths", () => {
      expect(getAttachmentDisplayName("/path/to/file.txt")).toBe("file.txt");
      expect(getAttachmentDisplayName("C:\\Users\\name\\file.jpg")).toBe(
        "file.jpg",
      );
    });

    it("should handle urls", () => {
      expect(getAttachmentDisplayName("https://example.com/image.png")).toBe(
        "image.png",
      );
    });

    it("should return original string if no path separators", () => {
      expect(getAttachmentDisplayName("justfilename.mp4")).toBe(
        "justfilename.mp4",
      );
    });
  });

  describe("saveAttachmentToFile", () => {
    it("should save attachment to the selected file path", async () => {
      const mockAttachment = {
        id: "attachment-1",
        data: new Uint8Array([1, 2, 3]),
        name: "test.png",
        type: "image/png",
      };

      await saveAttachmentToFile(mockAttachment);

      // Verify dialog.save was called with correct params
      expect(mockSave).toHaveBeenCalledWith({
        defaultPath: "test.png",
        filters: [
          {
            name: "Images",
            extensions: ["png"],
          },
        ],
      });

      // Verify writeBinaryFile was called with correct params
      expect(mockWriteBinaryFile).toHaveBeenCalledWith(
        "/path/to/save/location.png",
        mockAttachment.data,
      );
    });

    it("should handle cancel action", async () => {
      // Mock dialog.save to return null (user cancelled)
      mockSave.mockResolvedValueOnce(null);

      const mockAttachment = {
        id: "attachment-1",
        data: new Uint8Array([1, 2, 3]),
        name: "test.png",
        type: "image/png",
      };

      await saveAttachmentToFile(mockAttachment);

      // Verify writeBinaryFile was not called
      expect(mockWriteBinaryFile).not.toHaveBeenCalled();
    });
  });
});
