import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Component that throws an error
const ErrorComponent = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>No error</div>;
};

// Override console.error to avoid test noise
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("ErrorBoundary", () => {
  it("should render children when there's no error", () => {
    render(
      <ErrorBoundary>
        <div>Test Child</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Test Child")).toBeInTheDocument();
  });

  it("should render error UI when child throws", () => {
    // Need to use the jest/vitest version of error boundary testing
    const spy = vi.spyOn(console, "error");
    spy.mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    // Error boundary should show error message
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Test error/i)).toBeInTheDocument();

    // Cleanup
    spy.mockRestore();
  });

  it("should call the onError prop when an error occurs", () => {
    const mockOnError = vi.fn();
    const spy = vi.spyOn(console, "error");
    spy.mockImplementation(() => {});

    render(
      <ErrorBoundary onError={mockOnError}>
        <ErrorComponent />
      </ErrorBoundary>,
    );

    // onError should be called with the error
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test error",
      }),
    );

    // Cleanup
    spy.mockRestore();
  });

  it("should allow retry by clicking the retry button", async () => {
    const spy = vi.spyOn(console, "error");
    spy.mockImplementation(() => {});

    // Set up user-event
    const user = userEvent.setup();

    // Create a component that throws once, then shows content
    let shouldThrow = true;
    const TestComponent = () => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error("Temporary error");
      }
      return <div>Recovered</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>,
    );

    // Error boundary should show error message
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    // Click retry button
    const retryButton = screen.getByRole("button", { name: /try again/i });
    await user.click(retryButton);

    // This forces a re-render after state changes
    rerender(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>,
    );

    // Should now show recovered content
    expect(screen.getByText("Recovered")).toBeInTheDocument();

    // Cleanup
    spy.mockRestore();
  });
});
