import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLabelStore } from "@/store/labelStore";
import { ftrackNoteService } from "@/services/ftrack/FtrackNoteService";

// Mock the new ftrack note service
vi.mock("@/services/ftrack/FtrackNoteService", () => ({
  ftrackNoteService: {
    getNoteLabels: vi.fn(),
  },
}));

describe("labelStore", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset the store state before each test
    useLabelStore.setState({
      labels: [],
      isLoading: false,
      error: null,
    });
  });

  it("should initialize with default values", () => {
    const state = useLabelStore.getState();

    expect(state.labels).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("should fetch labels successfully", async () => {
    // Mock data
    const mockLabels = [
      { id: "1", name: "Bug", color: "#ff0000" },
      { id: "2", name: "Feature", color: "#00ff00" },
    ];

    // Mock the service response
    (ftrackNoteService.getNoteLabels as any).mockResolvedValue(mockLabels);

    // Call the fetch function
    await useLabelStore.getState().fetchLabels();

    // Verify the service was called
    expect(ftrackNoteService.getNoteLabels).toHaveBeenCalledTimes(1);

    // Check the store was updated correctly
    const state = useLabelStore.getState();
    expect(state.labels).toEqual(mockLabels);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("should handle fetch errors", async () => {
    // Mock error
    const mockError = new Error("Failed to fetch labels");

    // Mock the service to throw an error
    (ftrackNoteService.getNoteLabels as any).mockRejectedValue(mockError);

    // Spy on console.error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Call the fetch function
    await useLabelStore.getState().fetchLabels();

    // Verify the service was called
    expect(ftrackNoteService.getNoteLabels).toHaveBeenCalledTimes(1);

    // Check the store was updated correctly with the error
    const state = useLabelStore.getState();
    expect(state.labels).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toEqual(mockError);

    // Verify the error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to fetch note labels:",
      mockError,
    );

    // Restore console.error
    consoleSpy.mockRestore();
  });
});
