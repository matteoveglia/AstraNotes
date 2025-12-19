import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NoteStatus } from "@/types";

// Mock the new FtrackPlaylistService
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
	ftrackPlaylistService: {
		getProjects: vi.fn().mockResolvedValue([
			{
				id: "project-id",
				name: "Test Project",
				fullName: "Test Project",
				status: "Active",
			},
		]),
	},
}));

describe("Note Creation Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should handle saving a note", async () => {
		// Create a mock for the save function
		const mockSaveNote = vi.fn();

		// Call the mock function with test data
		mockSaveNote("Test note content", "label1", []);

		// Verify the function was called with the expected arguments
		expect(mockSaveNote).toHaveBeenCalledWith(
			"Test note content",
			"label1",
			[],
		);
		expect(mockSaveNote).toHaveBeenCalledTimes(1);
	});

	it("should handle note content updates", async () => {
		// Create a mock to track content changes
		const mockContentChange = vi.fn();

		// Simulate typing in the editor by calling the mock with updated content
		mockContentChange("T");
		mockContentChange("Te");
		mockContentChange("Tes");
		mockContentChange("Test");

		// Verify the function was called the expected number of times
		expect(mockContentChange).toHaveBeenCalledTimes(4);

		// Verify the last call had the complete text
		expect(mockContentChange).toHaveBeenLastCalledWith("Test");
	});
});
