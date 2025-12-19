/**
 * Network utility functions for handling API calls with error handling and notifications.
 */

import { useToast } from "@/components/ui/toast";
import { useCallback } from "react";
import { safeConsoleError } from "./errorHandling";

/**
 * A hook that provides API functions with built-in notification handling.
 * Wraps API calls with proper error handling and success/error notifications.
 */
export function useApiWithNotifications() {
	const toast = useToast();

	/**
	 * Generic function to handle API operations with proper notifications
	 * @param apiFn The API function to execute
	 * @param items Array of items to process through the API function
	 * @param options Configuration options
	 */
	const apiWithNotifications = useCallback(
		async <T>(
			apiFn: (items: T[]) => Promise<{ success: T[]; failed: T[] }>,
			items: T[],
			options: {
				successMessage?: (result: { success: T[]; failed: T[] }) => string;
				errorMessage?: (result: { success: T[]; failed: T[] }) => string;
				warningMessage?: (result: { success: T[]; failed: T[] }) => string;
				showToast?: boolean;
			} = {},
		): Promise<{ success: T[]; failed: T[] }> => {
			try {
				// Execute the API function
				const result = await apiFn(items);

				// Show appropriate notifications based on results
				if (options.showToast !== false) {
					if (result.failed.length === 0 && result.success.length > 0) {
						// All items succeeded
						const message = options.successMessage
							? options.successMessage(result)
							: `Successfully processed ${result.success.length} item${result.success.length !== 1 ? "s" : ""}`;
						toast.showSuccess(message);
					} else if (result.success.length === 0 && result.failed.length > 0) {
						// All items failed
						const message = options.errorMessage
							? options.errorMessage(result)
							: `Failed to process ${result.failed.length} item${result.failed.length !== 1 ? "s" : ""}`;
						toast.showError(message);
					} else if (result.success.length > 0 && result.failed.length > 0) {
						// Mixed results
						const message = options.warningMessage
							? options.warningMessage(result)
							: `Processed ${result.success.length} item${result.success.length !== 1 ? "s" : ""} successfully, but ${result.failed.length} failed`;
						toast.showWarning(message);
					}
				}

				return result;
			} catch (error) {
				// Handle unexpected errors with safe logging
				safeConsoleError("API operation failed:", error);
				toast.showError(
					`Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
				return { success: [], failed: items };
			}
		},
		[toast],
	);

	/**
	 * Function specifically for publishing notes with notifications
	 */
	const publishWithNotifications = useCallback(
		<T extends { versionId: string }>(
			apiFn: (items: T[]) => Promise<{ success: T[]; failed: T[] }>,
			items: T[],
		) => {
			return apiWithNotifications(apiFn, items, {
				successMessage: (result) =>
					`Successfully published ${result.success.length} note${result.success.length !== 1 ? "s" : ""}`,
				errorMessage: (result) =>
					`Failed to publish ${result.failed.length} note${result.failed.length !== 1 ? "s" : ""}`,
				warningMessage: (result) =>
					`Published ${result.success.length} note${result.success.length !== 1 ? "s" : ""}, but ${result.failed.length} failed`,
			});
		},
		[apiWithNotifications],
	);

	/**
	 * Function for handling retry logic
	 */
	const withRetry = useCallback(
		async <T>(
			fn: () => Promise<T>,
			retries: number = 3,
			delay: number = 1000,
		): Promise<T> => {
			try {
				return await fn();
			} catch (error) {
				if (retries <= 0) {
					throw error;
				}

				// Wait for the specified delay
				await new Promise((resolve) => setTimeout(resolve, delay));

				// Try again with one less retry
				return withRetry(fn, retries - 1, delay * 2);
			}
		},
		[],
	);

	return {
		apiWithNotifications,
		publishWithNotifications,
		withRetry,
	};
}
