import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaylistsStore } from "@/store/playlistsStore";
import { db } from "@/store/db";

// Mock the ftrack services
vi.mock("@/services/ftrack/FtrackPlaylistService");
vi.mock("@/services/ftrack/FtrackNoteService");

describe("Hook Render Test", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		// Clear database
		await db.playlists.clear();
		await db.versions.clear();
	});

	it("should render hook and access loadPlaylists", async () => {
		const { result } = renderHook(() => usePlaylistsStore());

		console.log("Hook result:", result.current);
		expect(result.current).toBeDefined();
		expect(result.current).not.toBeNull();
		expect(typeof result.current.loadPlaylists).toBe("function");

		// Try to call loadPlaylists
		await act(async () => {
			try {
				await result.current.loadPlaylists("test-project");
			} catch (error) {
				console.log("Expected error (no mock setup):", error);
			}
		});

		// Hook should still be valid after the call
		expect(result.current).toBeDefined();
		expect(result.current).not.toBeNull();
	});

	it("should handle database error mock", async () => {
		// Mock a database error during cleanup
		const originalClear = db.playlists.clear;
		vi.spyOn(db.playlists, "clear").mockRejectedValueOnce(
			new Error("Database error"),
		);

		const { result } = renderHook(() => usePlaylistsStore());

		console.log("Hook result before error:", result.current);
		expect(result.current).toBeDefined();
		expect(result.current).not.toBeNull();

		// Try to call loadPlaylists with the mocked error
		await act(async () => {
			try {
				await result.current.loadPlaylists("test-project");
			} catch (error) {
				console.log("Expected error:", error);
			}
		});

		// Restore original method
		db.playlists.clear = originalClear;

		// Hook should still be valid after the error
		console.log("Hook result after error:", result.current);
		expect(result.current).toBeDefined();
		expect(result.current).not.toBeNull();
	});
});
