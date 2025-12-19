import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeError, safeConsoleError } from "@/utils/errorHandling";

describe("Error Sanitization", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe("sanitizeError", () => {
		it("should redact API keys from error messages", () => {
			const error = new Error("Invalid api_key: abc123xyz");
			const sanitized = sanitizeError(error) as Error;

			expect(sanitized.message).toBe("Invalid api_key: [REDACTED]");
			expect(sanitized.name).toBe(error.name);
		});

		it("should redact multiple credential types", () => {
			const error = new Error(
				"Auth failed: token: bearer123, password: secret123, api-key: key456",
			);
			const sanitized = sanitizeError(error) as Error;

			expect(sanitized.message).toBe(
				"Auth failed: token: [REDACTED], password: [REDACTED], api-key: [REDACTED]",
			);
		});

		it("should redact Authorization headers", () => {
			const error = new Error("Request failed with Basic YWJjOjEyMw==");
			const sanitized = sanitizeError(error) as Error;

			expect(sanitized.message).toBe("Request failed with Basic [REDACTED]");
		});

		it("should redact Bearer tokens", () => {
			const error = new Error("Unauthorized: Bearer eyJhbGciOiJIUzI1NiIs");
			const sanitized = sanitizeError(error) as Error;

			expect(sanitized.message).toBe("Unauthorized: Bearer [REDACTED]");
		});

		it("should handle string errors", () => {
			const error = "API key: secret123 is invalid";
			const sanitized = sanitizeError(error) as string;

			expect(sanitized).toBe("api_key: [REDACTED] is invalid");
		});

		it("should preserve non-credential errors", () => {
			const error = new Error("Network timeout occurred");
			const sanitized = sanitizeError(error) as Error;

			expect(sanitized.message).toBe("Network timeout occurred");
		});

		it("should handle unknown error types", () => {
			const error = { someProperty: "value" };
			const sanitized = sanitizeError(error);

			expect(sanitized).toBe(error);
		});
	});

	describe("safeConsoleError", () => {
		it("should log sanitized errors", () => {
			const error = new Error("Invalid apiKey: abc123");
			safeConsoleError("Test message", error);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Test message",
				expect.objectContaining({
					message: "Invalid api_key: [REDACTED]",
				}),
			);
		});

		it("should handle messages without errors", () => {
			safeConsoleError("Just a message");

			expect(consoleErrorSpy).toHaveBeenCalledWith("Just a message", undefined);
		});
	});
});
