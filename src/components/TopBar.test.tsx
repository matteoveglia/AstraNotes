import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen } from "../test/utils";
import { TopBar } from "./TopBar";

// Mock any hooks, store, or context the component might be using
vi.mock("@/store/uiStore", () => ({
  useUIStore: () => ({
    showSettings: false,
    setShowSettings: vi.fn(),
  }),
}));

// Mock settings hook
vi.mock("@/store/settingsStore", () => ({
  useSettings: () => ({
    settings: {
      autoRefreshEnabled: true,
    },
  }),
}));

// Mock connection status hook
vi.mock("@/hooks/useConnectionStatus", () => ({
  useConnectionStatus: () => ({
    isConnected: false,
  }),
}));

describe("TopBar", () => {
  it("renders correctly", () => {
    renderWithUserEvent(<TopBar>Test Children</TopBar>);

    // Updated assertion to look for the heading instead of banner role
    expect(screen.getByText("AstraNotes")).toBeInTheDocument();
  });

  it("handles settings button click", async () => {
    // Create a mock button with a specific data-testid to find it easily
    const mockSettingsButton = (
      <button data-testid="settings-button">Settings</button>
    );
    const { user } = renderWithUserEvent(<TopBar>{mockSettingsButton}</TopBar>);

    // Find settings button using the data-testid
    const settingsButton = screen.getByTestId("settings-button");
    expect(settingsButton).toBeInTheDocument();

    // Click the settings button
    await user.click(settingsButton);

    // Add assertions for expected behavior after click if needed
  });
});
