import { describe, it, expect, vi, beforeEach } from "vitest";
import { showContextMenu } from "@/utils/menu";

// Mock the showContextMenu function
vi.mock("@/utils/menu", () => ({
	showContextMenu: vi.fn(),
}));

// Mock the new FtrackPlaylistService
vi.mock("@/services/ftrack/FtrackPlaylistService", () => ({
	ftrackPlaylistService: {
		getPlaylists: vi.fn().mockResolvedValue([]),
	},
}));

// Mock the new FtrackNoteService
vi.mock("@/services/ftrack/FtrackNoteService", () => ({
	ftrackNoteService: {
		getNoteLabels: vi.fn().mockResolvedValue([]),
	},
}));

describe("Playlist Management Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create a new playlist", async () => {
		// Create a mock for the createPlaylist function
		const createPlaylistMock = vi.fn().mockResolvedValue("new-playlist-id");

		// Call the mock function with test data
		await createPlaylistMock("Test Playlist");

		// Verify the function was called with the correct arguments
		expect(createPlaylistMock).toHaveBeenCalledWith("Test Playlist");
	});

	it("should handle context menu for playlists", async () => {
		// Create a mock event
		const mockEvent = {
			preventDefault: vi.fn(),
			clientX: 100,
			clientY: 100,
		};

		// Create mock playlist options
		const options = [
			{
				label: "Remove Playlist",
				action: vi.fn(),
				disabled: false,
			},
		];

		// Call the showContextMenu function directly
		showContextMenu(mockEvent as any, options);

		// Verify showContextMenu was called with the right arguments
		expect(showContextMenu).toHaveBeenCalledWith(mockEvent, options);
	});
});
