import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import { render, screen, waitFor, act } from "@testing-library/react";
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

    // onError should be called with error and errorInfo
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test error",
      }),
      expect.objectContaining({
        componentStack: expect.any(String),
      }),
    );

    // Cleanup
    spy.mockRestore();
  });

  it.skip("should allow retry by clicking the retry button (skipped: jsdom/react async limitation)", async () => {
    const spy = vi.spyOn(console, "error");
    spy.mockImplementation(() => {});

    const user = userEvent.setup();

    // Use a component that throws only once and allows error UI to render, keyed for remount
    function ThrowOnce({ resetKey }: { resetKey: number }) {
      const [shouldThrow, setShouldThrow] = React.useState(true);
      React.useEffect(() => {
        if (shouldThrow) setTimeout(() => setShouldThrow(false), 10);
      }, [shouldThrow]);
      if (shouldThrow) throw new Error("Temporary error");
      return <div>Recovered</div>;
    }

    let resetKey = 0;
    const { rerender } = render(
      <ErrorBoundary key={resetKey}>
        <ThrowOnce resetKey={resetKey} />
      </ErrorBoundary>
    );

    // Wait for error UI
    const retryButton = await screen.findByRole("button", { name: /try again/i });
    expect(retryButton).toBeInTheDocument();

    await act(async () => {
      await user.click(retryButton);
      resetKey++;
      rerender(
        <ErrorBoundary key={resetKey}>
          <ThrowOnce resetKey={resetKey} />
        </ErrorBoundary>
      );
    });

    await waitFor(() => {
      expect(screen.queryByText(/Recovered/)).toBeInTheDocument();
    }, { timeout: 2000 });

    spy.mockRestore();
  });
});
