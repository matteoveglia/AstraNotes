/**
 * Error handling utilities
 */

import { useToast } from "@/components/ui/toast";

/**
 * Categorizes an error and returns information about its type
 */
export function categorizeError(error: unknown): {
  isNetworkError: boolean;
  isAuthError: boolean;
  message: string;
  name: string;
} {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorName = error instanceof Error ? error.name : "";

  const isNetworkError =
    errorMessage.includes("Network") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("offline") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("load error") ||
    errorMessage.includes("Failed to fetch");

  const isAuthError =
    errorName === "AuthenticationError" ||
    errorName === "ServerError" ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("auth") ||
    errorMessage.includes("credentials") ||
    errorMessage.includes("API key") ||
    errorMessage.includes("Invalid username") ||
    errorMessage.includes("ftrack-user") ||
    errorMessage.includes("session") ||
    errorMessage.includes("401") ||
    errorMessage.includes("403");

  return {
    isNetworkError,
    isAuthError,
    message: errorMessage,
    name: errorName,
  };
}

/**
 * Hook for handling API errors with toast notifications
 */
export function useErrorHandler() {
  const toast = useToast();

  /**
   * Handle an error and show appropriate toast notification
   */
  const handleError = (error: unknown, context: string = "") => {
    console.error(`Error ${context ? `in ${context}` : ""}:`, error);

    const { isNetworkError, isAuthError, message, name } =
      categorizeError(error);

    if (isNetworkError) {
      toast.showError(
        `Connection Error: Unable to connect to ftrack API. Please check your internet connection.`,
      );
    } else if (isAuthError) {
      if (
        name === "ServerError" ||
        message.includes("Invalid username") ||
        message.includes("ftrack-user")
      ) {
        toast.showError(
          `Authentication Error: Invalid username or API key. Please check your ftrack credentials in settings.`,
        );
      } else {
        toast.showError(
          `Authentication Error: Please check your API credentials in settings.`,
        );
      }
    } else {
      toast.showError(`${context ? `${context}: ` : ""}${message}`);
    }
  };

  return { handleError };
}
