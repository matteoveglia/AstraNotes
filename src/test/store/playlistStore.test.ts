import { describe, it, expect, vi, beforeEach } from "vitest";
import { playlistStore } from "@/store/playlistStore";
import { act } from "@testing-library/react";

// Create mock instances
const mockDbPlaylists = {
  get: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  toArray: vi.fn(),
  where: vi.fn().mockReturnThis(),
  equals: vi.fn().mockReturnThis(),
  first: vi.fn(),
};

const mockDbNotes = {
  where: vi.fn().mockReturnThis(),
  equals: vi.fn().mockReturnThis(),
  toArray: vi.fn(),
  delete: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  bulkAdd: vi.fn(),
  get: vi.fn(),
};

const mockDbTransaction = vi
  .fn()
  .mockImplementation(async (mode, tableName, callback) => {
    return callback();
  });

// Mock DB functions
vi.mock("./db", () => ({
  db: {
    playlists: mockDbPlaylists,
    notes: mockDbNotes,
    transaction: mockDbTransaction,
  },
}));

// Mock ftrack service functions
const mockGetCurrentProject = vi
  .fn()
  .mockResolvedValue({ id: "project-1", name: "Test Project" });
const mockCreateNoteOnVersion = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();

// Mock ftrack service
vi.mock("../services/ftrack", () => ({
  ftrackService: {
    getCurrentProject: mockGetCurrentProject,
    createNoteOnVersion: mockCreateNoteOnVersion,
    updateNote: mockUpdateNote,
    deleteNote: mockDeleteNote,
  },
}));

describe("playlistStore", () => {
  const { usePlaylistStore } = playlistStore;

  beforeEach(() => {
    // Reset the store state
    act(() => {
      usePlaylistStore.setState({
        playlists: [],
        activePlaylist: null,
        activePlaylistNotes: [],
        loadingNotes: false,
        isEditing: false,
        isUploading: false,
        uploadStatus: { total: 0, current: 0 },
        error: null,
      });
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("Basic Store Functions", () => {
    it("should initialize with default values", () => {
      const state = usePlaylistStore.getState();

      expect(state.playlists).toEqual([]);
      expect(state.activePlaylist).toBeNull();
      expect(state.activePlaylistNotes).toEqual([]);
      expect(state.loadingNotes).toBe(false);
      expect(state.isEditing).toBe(false);
      expect(state.isUploading).toBe(false);
      expect(state.uploadStatus).toEqual({ total: 0, current: 0 });
      expect(state.error).toBeNull();
    });

    it("should set the active playlist", () => {
      const mockPlaylist = { id: "playlist-1", name: "Test Playlist" };

      act(() => {
        usePlaylistStore.getState().setActivePlaylist(mockPlaylist);
      });

      const state = usePlaylistStore.getState();
      expect(state.activePlaylist).toEqual(mockPlaylist);
    });

    it("should set error state", () => {
      const mockError = new Error("Test error");

      act(() => {
        usePlaylistStore.getState().setError(mockError);
      });

      const state = usePlaylistStore.getState();
      expect(state.error).toEqual(mockError);
    });

    it("should clear error state", () => {
      act(() => {
        usePlaylistStore.getState().setError(new Error("Test error"));
        usePlaylistStore.getState().clearError();
      });

      const state = usePlaylistStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe("Playlist Operations", () => {
    it("should create a new playlist", async () => {
      // Set up the mock to return a playlist ID
      mockDbPlaylists.add.mockResolvedValue("new-playlist-id");

      const newPlaylist = {
        name: "New Playlist",
        description: "Test Description",
      };

      await usePlaylistStore.getState().createPlaylist(newPlaylist);

      expect(mockDbPlaylists.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Playlist",
          description: "Test Description",
        }),
      );
    });

    it("should set a playlist as active after creating it", async () => {
      const mockPlaylist = {
        id: "new-playlist-id",
        name: "New Playlist",
        description: "Test Description",
      };

      // Set up the mock sequence
      mockDbPlaylists.add.mockResolvedValue("new-playlist-id");
      mockDbPlaylists.get.mockResolvedValue(mockPlaylist);

      await usePlaylistStore.getState().createPlaylist({
        name: "New Playlist",
        description: "Test Description",
      });

      // First verify the add was called
      expect(mockDbPlaylists.add).toHaveBeenCalled();

      // Then verify get was called with the correct ID
      expect(mockDbPlaylists.get).toHaveBeenCalledWith("new-playlist-id");

      // Finally check the state
      const state = usePlaylistStore.getState();
      expect(state.activePlaylist).toEqual(mockPlaylist);
    });
  });

  describe("Note Operations", () => {
    it("should add a note to the active playlist", async () => {
      const mockPlaylist = { id: "playlist-1", name: "Test Playlist" };
      const mockNote = {
        content: "Test note",
        labelId: "label-1",
        attachments: [],
      };

      // Setup the mocks
      mockDbNotes.add.mockResolvedValue("new-note-id");

      // Set active playlist first
      act(() => {
        usePlaylistStore.setState({ activePlaylist: mockPlaylist });
      });

      // Call the addNote function
      await usePlaylistStore.getState().addNote(mockNote);

      // Verify notes.add was called with correct data
      expect(mockDbNotes.add).toHaveBeenCalledWith(
        expect.objectContaining({
          playlistId: "playlist-1",
          content: "Test note",
          labelId: "label-1",
        }),
      );
    });

    it("should load notes for the active playlist", async () => {
      const mockPlaylist = { id: "playlist-1", name: "Test Playlist" };
      const mockNotes = [
        { id: "note-1", content: "Note 1", playlistId: "playlist-1" },
        { id: "note-2", content: "Note 2", playlistId: "playlist-1" },
      ];

      // Setup the mock return value
      mockDbNotes.toArray.mockResolvedValue(mockNotes);

      // Set active playlist
      act(() => {
        usePlaylistStore.setState({ activePlaylist: mockPlaylist });
      });

      // Call the load function
      await usePlaylistStore.getState().loadNotesForActivePlaylist();

      // Verify notes.where and equals were called
      expect(mockDbNotes.where).toHaveBeenCalledWith("playlistId");
      expect(mockDbNotes.equals).toHaveBeenCalledWith("playlist-1");

      // Check the state was updated
      const state = usePlaylistStore.getState();
      expect(state.activePlaylistNotes).toEqual(mockNotes);
      expect(state.loadingNotes).toBe(false);
    });
  });
});
