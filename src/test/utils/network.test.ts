import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApiWithNotifications } from "@/utils/network";

// Mock the toast component
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

describe("network utilities", () => {
  describe("withRetry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("should return successful result on first try", async () => {
      // Setup a successful function
      const successFn = vi.fn().mockResolvedValue("success");

      // Use the hook
      const { result } = renderHook(() => useApiWithNotifications());

      // Call withRetry with the successful function
      const promise = result.current.withRetry(successFn);

      // Await the promise
      await expect(promise).resolves.toBe("success");

      // Check that the function was called once and returned correct value
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it("should retry specified number of times before succeeding", async () => {
      // Setup a function that fails twice, then succeeds
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValue("success after retries");

      // Use the hook
      const { result } = renderHook(() => useApiWithNotifications());

      // Call withRetry with the function
      const promise = result.current.withRetry(mockFn, 3, 100);

      // Instead of advancing timers, let's mock the setTimeout to execute immediately
      vi.spyOn(global, "setTimeout").mockImplementation((fn) => {
        if (typeof fn === "function") fn();
        return 1 as any;
      });

      // Await the promise
      await expect(promise).resolves.toBe("success after retries");

      // Check that the function was called 3 times (original + 2 retries)
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it("should throw error after exhausting all retries", async () => {
      // Setup a function that always fails
      const error = new Error("Always fails");
      const failingFn = vi.fn().mockRejectedValue(error);

      // Use the hook
      const { result } = renderHook(() => useApiWithNotifications());

      // Call withRetry with the failing function
      const promise = result.current.withRetry(failingFn, 2, 100);

      // Instead of advancing timers, let's mock the setTimeout to execute immediately
      vi.spyOn(global, "setTimeout").mockImplementation((fn) => {
        if (typeof fn === "function") fn();
        return 1 as any;
      });

      // Expect the promise to reject with the original error
      await expect(promise).rejects.toThrow(error);

      // Check that the function was called 3 times (original + 2 retries)
      expect(failingFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("apiWithNotifications", () => {
    it("should show success toast when all items succeed", async () => {
      // Create mock API function that always succeeds
      const mockApiFn = vi.fn().mockResolvedValue({
        success: [{ id: 1 }, { id: 2 }],
        failed: [],
      });

      // Use the hook
      const { result } = renderHook(() => useApiWithNotifications());
      const toastSpy = vi.spyOn(result.current, "apiWithNotifications");

      // Call apiWithNotifications
      await result.current.apiWithNotifications(mockApiFn, [
        { id: 1 },
        { id: 2 },
      ]);

      // Verify the API function was called with correct parameters
      expect(mockApiFn).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
      expect(toastSpy).toHaveBeenCalled();
    });

    it("should handle errors and return empty success array", async () => {
      // Create mock API function that throws an error
      const mockError = new Error("API failed");
      const mockApiFn = vi.fn().mockRejectedValue(mockError);

      // Mock console.error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Use the hook
      const { result } = renderHook(() => useApiWithNotifications());

      // Call apiWithNotifications
      const response = await result.current.apiWithNotifications(mockApiFn, [
        { id: 1 },
        { id: 2 },
      ]);

      // Verify error handling
      expect(consoleSpy).toHaveBeenCalledWith(
        "API operation failed:",
        expect.objectContaining({
          message: mockError.message,
          name: mockError.name
        }),
      );
      expect(response).toEqual({
        success: [],
        failed: [{ id: 1 }, { id: 2 }],
      });

      // Restore console.error
      consoleSpy.mockRestore();
    });
  });
});
