import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

// Define a custom wrapper if your app has providers (like context providers)
// that components need to be wrapped in for testing
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  // Add any custom options needed
}

// Custom render function that includes all providers needed for tests
function customRender(ui: ReactElement, options?: CustomRenderOptions) {
  return render(ui, {
    // Wrap in any providers your app needs
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    ...options,
  });
}

// Setup user-event
function setupUserEvent() {
  return userEvent.setup();
}

// Helper to combine render and user-event
function renderWithUserEvent(ui: ReactElement, options?: CustomRenderOptions) {
  return {
    user: setupUserEvent(),
    ...customRender(ui, options),
  };
}

// Re-export everything from testing-library
export * from "@testing-library/react";

// Override render method
export { customRender as render, setupUserEvent, renderWithUserEvent };

// Re-export mock data factories for easy access in tests
export * from './utils/factories';
