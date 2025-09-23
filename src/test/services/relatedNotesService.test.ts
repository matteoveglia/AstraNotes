import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelatedNotesService } from "@/services/relatedNotesService";
import type { ShotNote } from "@/types/relatedNotes";

// Mock the BaseFtrackClient
vi.mock("@/services/ftrack/BaseFtrackClient", () => ({
  BaseFtrackClient: class {
    async getSession() {
      return mockSession;
    }
  },
}));

// Mock session object
const mockSession = {
  query: vi.fn(),
};

// Mock data
const mockVersionIds = ["version1", "version2", "version3"];
const mockRawNotes = [
  {
    id: "note1",
    content: "Test note 1",
    created_date: "2024-01-01T10:00:00Z",
    user_id: "user1",
    parent_id: "version1",
    parent_type: "AssetVersion",
  },
  {
    id: "note2",
    content: "Test note 2",
    created_date: "2024-01-02T11:00:00Z",
    user_id: "user2",
    parent_id: "version2",
    parent_type: "AssetVersion",
  },
];

const mockUsers = [
  {
    id: "user1",
    username: "john.doe",
    first_name: "John",
    last_name: "Doe",
  },
  {
    id: "user2",
    username: "jane.smith",
    first_name: "Jane",
    last_name: "Smith",
  },
];

const mockVersions = [
  {
    id: "version1",
    version: 1,
    asset: { name: "ASE0110_comp" },
    thumbnail: { id: "thumb1" },
  },
  {
    id: "version2",
    version: 2,
    asset: { name: "ASE0110_lighting" },
    thumbnail: { id: "thumb2" },
  },
];

const mockLabels = [
  {
    note_id: "note1",
    label: {
      id: "label1",
      name: "Client Feedback",
      color: "#ff0000",
    },
  },
];

const mockAttachments = [
  {
    note_id: "note1",
    component: {
      id: "attachment1",
      name: "reference.jpg",
      file_type: "image/jpeg",
      size: 1024,
    },
  },
];

describe("RelatedNotesService", () => {
  let service: RelatedNotesService;

  beforeEach(() => {
    service = new RelatedNotesService();
    vi.clearAllMocks();

    // Clear cache before each test
    service.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractShotName", () => {
    it("should extract shot name from ASE pattern", () => {
      const result = service.extractShotName("ASE0110_comp_000000_GMK");
      expect(result).toBe("ASE0110");
    });

    it("should extract shot name from SQ_SH pattern", () => {
      const result = service.extractShotName("SQ010_SH020_layout_v001");
      expect(result).toBe("SQ010_SH020");
    });

    it("should extract shot name from shot_number pattern", () => {
      const result = service.extractShotName("shot_010_lighting_v003");
      expect(result).toBe("shot_010");
    });

    it("should handle single part names", () => {
      const result = service.extractShotName("singlename");
      expect(result).toBe("singlename");
    });

    it("should use first part as default", () => {
      const result = service.extractShotName("custom_naming_convention");
      expect(result).toBe("custom");
    });
  });

  describe("fetchNotesByShotName", () => {
    it("should fetch and process notes successfully", async () => {
      // Setup mock session responses for this specific test
      mockSession.query
        .mockResolvedValueOnce({
          // Version IDs query
          data: mockVersionIds.map((id) => ({ id })),
        })
        .mockResolvedValueOnce({
          // Raw notes query
          data: mockRawNotes,
        })
        .mockResolvedValueOnce({
          // Users query
          data: mockUsers,
        })
        .mockResolvedValueOnce({
          // Versions query
          data: mockVersions,
        })
        .mockResolvedValueOnce({
          // Labels query
          data: mockLabels,
        })
        .mockResolvedValueOnce({
          // Attachments query
          data: mockAttachments,
        });

      const result = await service.fetchNotesByShotName("ASE0110");

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "note1",
        content: "Test note 1",
        createdAt: "2024-01-01T10:00:00Z",
        user: {
          id: "user1",
          username: "john.doe",
          firstName: "John",
          lastName: "Doe",
        },
        version: {
          id: "version1",
          name: "ASE0110_comp",
          version: 1,
          thumbnailId: "thumb1",
        },
        labels: [
          {
            id: "label1",
            name: "Client Feedback",
            color: "#ff0000",
          },
        ],
        attachments: [
          {
            id: "attachment1",
            name: "reference.jpg",
            type: "image/jpeg",
            size: 1024,
          },
        ],
      });
    });

    it("should return empty array when no versions found", async () => {
      mockSession.query.mockResolvedValueOnce({
        data: [], // No versions
      });

      const result = await service.fetchNotesByShotName("NONEXISTENT");
      expect(result).toEqual([]);
    });

    it("should return empty array when no notes found", async () => {
      mockSession.query
        .mockResolvedValueOnce({
          data: mockVersionIds.map((id) => ({ id })), // Versions found
        })
        .mockResolvedValueOnce({
          data: [], // No notes
        });

      const result = await service.fetchNotesByShotName("ASE0110");
      expect(result).toEqual([]);
    });

    it("should handle missing user data gracefully", async () => {
      mockSession.query
        .mockResolvedValueOnce({
          data: mockVersionIds.map((id) => ({ id })),
        })
        .mockResolvedValueOnce({
          data: [mockRawNotes[0]], // One note
        })
        .mockResolvedValueOnce({
          data: [], // No users found
        })
        .mockResolvedValueOnce({
          data: mockVersions,
        })
        .mockResolvedValueOnce({
          data: [],
        })
        .mockResolvedValueOnce({
          data: [],
        });

      const result = await service.fetchNotesByShotName("ASE0110");

      expect(result).toHaveLength(1);
      expect(result[0].user).toMatchObject({
        id: "user1",
        username: "Unknown User",
      });
    });

    it("should handle missing version data gracefully", async () => {
      mockSession.query
        .mockResolvedValueOnce({
          data: mockVersionIds.map((id) => ({ id })),
        })
        .mockResolvedValueOnce({
          data: [mockRawNotes[0]], // One note
        })
        .mockResolvedValueOnce({
          data: mockUsers,
        })
        .mockResolvedValueOnce({
          data: [], // No versions found
        })
        .mockResolvedValueOnce({
          data: [],
        })
        .mockResolvedValueOnce({
          data: [],
        });

      const result = await service.fetchNotesByShotName("ASE0110");

      expect(result).toHaveLength(1);
      expect(result[0].version).toMatchObject({
        id: "version1",
        name: "Unknown Version",
        version: 0,
      });
    });

    it("should throw error when session query fails", async () => {
      mockSession.query.mockRejectedValueOnce(new Error("API Error"));

      await expect(service.fetchNotesByShotName("ASE0110")).rejects.toThrow();
    });
  });

  describe("caching", () => {
    const setupSuccessfulMocks = () => {
      mockSession.query
        .mockResolvedValueOnce({ data: mockVersionIds.map((id) => ({ id })) })
        .mockResolvedValueOnce({ data: mockRawNotes })
        .mockResolvedValueOnce({ data: mockUsers })
        .mockResolvedValueOnce({ data: mockVersions })
        .mockResolvedValueOnce({ data: mockLabels })
        .mockResolvedValueOnce({ data: mockAttachments });
    };

    it("should cache results after first fetch", async () => {
      const shotName = "ASE0110";

      // Setup mocks for first call
      setupSuccessfulMocks();

      // First call should make API requests
      const result1 = await service.fetchNotesByShotName(shotName);
      expect(mockSession.query).toHaveBeenCalled();

      // Reset mock to verify no new calls
      vi.clearAllMocks();

      // Second call should use cache
      const result2 = await service.fetchNotesByShotName(shotName);
      expect(mockSession.query).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    });

    it("should clear cache for specific shot", async () => {
      const shotName = "ASE0110";

      // Setup mocks for first call
      setupSuccessfulMocks();

      // Fetch and cache
      await service.fetchNotesByShotName(shotName);

      // Clear cache for this shot
      service.clearCache(shotName);

      // Reset mock and setup for second call
      vi.clearAllMocks();
      setupSuccessfulMocks();

      // Should make API call again
      await service.fetchNotesByShotName(shotName);
      expect(mockSession.query).toHaveBeenCalled();
    });

    it("should clear all cache", async () => {
      const shotName1 = "ASE0110";
      const shotName2 = "ASE0120";

      // Setup mocks for first calls
      setupSuccessfulMocks();
      await service.fetchNotesByShotName(shotName1);

      setupSuccessfulMocks();
      await service.fetchNotesByShotName(shotName2);

      // Clear all cache
      service.clearCache();

      // Reset mock and setup for new call
      vi.clearAllMocks();
      setupSuccessfulMocks();

      // Should make API call again
      await service.fetchNotesByShotName(shotName1);
      expect(mockSession.query).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should create proper error objects", async () => {
      mockSession.query.mockRejectedValueOnce(new Error("Network error"));

      try {
        await service.fetchNotesByShotName("ASE0110");
      } catch (error: any) {
        expect(error).toHaveProperty("type", "api");
        expect(error).toHaveProperty("message");
        expect(error).toHaveProperty("retryable", true);
      }
    });
  });
});
