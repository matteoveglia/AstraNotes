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
    safeConsoleError(`Error ${context ? `in ${context}` : ""}:`, error);

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

/**
 * Sanitizes error messages by removing sensitive credential information
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    let message = error.message;

    // Remove API keys, tokens, and credential information - preserve original format
    // Handle both camelCase (apiKey) and snake/kebab case (api_key, api-key)
    message = message.replace(
      /(apiKey)[:\s]*[a-zA-Z0-9\-_.]+/gi,
      "api_key: [REDACTED]",
    );
    message = message.replace(
      /(api[_-]?key)[:\s]*[a-zA-Z0-9\-_.]+/gi,
      "$1: [REDACTED]",
    );
    message = message.replace(
      /(token)[:\s]*[a-zA-Z0-9\-_.]+/gi,
      "$1: [REDACTED]",
    );
    message = message.replace(/(password)[:\s]*[^\s,]+/gi, "$1: [REDACTED]");
    message = message.replace(/Basic\s+[a-zA-Z0-9+/=]+/gi, "Basic [REDACTED]");
    message = message.replace(
      /Bearer\s+[a-zA-Z0-9\-_.]+/gi,
      "Bearer [REDACTED]",
    );

    // Create a new error with sanitized message
    const sanitizedError = new Error(message);
    sanitizedError.name = error.name;
    sanitizedError.stack = error.stack?.replace(error.message, message);

    return sanitizedError;
  }

  if (typeof error === "string") {
    return error
      .replace(/(API key)[:\s]*[a-zA-Z0-9\-_.]+/gi, "api_key: [REDACTED]")
      .replace(/(token)[:\s]*[a-zA-Z0-9\-_.]+/gi, "$1: [REDACTED]")
      .replace(/(password)[:\s]*[^\s,]+/gi, "$1: [REDACTED]")
      .replace(/Basic\s+[a-zA-Z0-9+/=]+/gi, "Basic [REDACTED]")
      .replace(/Bearer\s+[a-zA-Z0-9\-_.]+/gi, "Bearer [REDACTED]");
  }

  return error;
}

/**
 * Safe console.error that sanitizes sensitive information
 */
export function safeConsoleError(message: string, error?: unknown) {
  const sanitizedError = error ? sanitizeError(error) : undefined;
  console.error(message, sanitizedError);
}
