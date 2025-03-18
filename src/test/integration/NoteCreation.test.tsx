import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithUserEvent, screen, waitFor, fireEvent } from "../utils";
import { NoteInput } from "@/components/NoteInput";
import userEvent from "@testing-library/user-event";

// Define mock store structure
interface MockPlaylistStore {
  addNote: ReturnType<typeof vi.fn>;
  activePlaylist: { id: string; name: string };
}

// Import types if NoteStatus is an enum
import { type NoteStatus } from "@/types";

// Mock necessary stores and services
vi.mock("@/store/playlistStore", () => ({
  // Use a named export mock instead of default export
  playlistStore: {
    usePlaylistStore: () => ({
      addNote: vi.fn(),
      activePlaylist: { id: "test-playlist-id", name: "Test Playlist" },
    }),
  },
}));

vi.mock("@/store/labelStore", () => ({
  useLabelStore: () => ({
    labels: [
      { id: "label1", name: "Bug", color: "#ff0000" },
      { id: "label2", name: "Feature", color: "#00ff00" },
    ],
    isLoading: false,
    error: null,
    fetchLabels: vi.fn(),
  }),
}));

// Mock the ftrack service
vi.mock("@/services/ftrack", () => ({
  ftrackService: {
    getCurrentProject: vi
      .fn()
      .mockResolvedValue({ id: "project-id", name: "Test Project" }),
  },
}));

// Create a simplified test for the note creation flow
// Import the mock using an alias to avoid TypeScript errors
import * as playlistStoreModule from "@/store/playlistStore";

describe("Note Creation Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow a user to create a note", async () => {
    // Mock props required by NoteInput
    const noteInputProps = {
      versionName: "Test Version",
      versionNumber: "v1.0",
      status: "draft" as NoteStatus,
      selected: false,
      initialContent: "",
      onSave: vi.fn(),
      onClear: vi.fn(),
      onSelectToggle: vi.fn(),
    };

    // Render the component with required props
    const { user } = renderWithUserEvent(<NoteInput {...noteInputProps} />);

    // Type into the note input
    const noteInput = screen.getByPlaceholderText(/add a note/i);
    expect(noteInput).toBeInTheDocument();

    await user.type(noteInput, "Test note content");

    // Verify the textarea contains the typed text
    expect(noteInput).toHaveValue("Test note content");

    // Check that onSave was called (since it's called on each change)
    expect(noteInputProps.onSave).toHaveBeenCalledWith(
      "Test note content",
      expect.any(String),
    );
  });

  it("should save note when text is entered", async () => {
    // Create a mock implementation that allows us to check both parameters
    const mockSaveNote = vi.fn();

    const noteInputProps = {
      versionName: "Test Version",
      versionNumber: "v1.0",
      status: "draft" as NoteStatus,
      selected: false,
      initialContent: "",
      onSave: mockSaveNote,
      onClear: vi.fn(),
      onSelectToggle: vi.fn(),
    };

    renderWithUserEvent(<NoteInput {...noteInputProps} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Test note");

    // Verify the textarea contains the typed text
    expect(textarea).toHaveValue("Test note");

    // Check that onSave was called with both content and label parameters
    await waitFor(
      () => {
        expect(mockSaveNote).toHaveBeenCalledWith(
          "Test note",
          expect.any(String),
        );
      },
      { timeout: 2000 },
    );
  });
});
