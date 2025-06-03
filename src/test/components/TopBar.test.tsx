import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen } from "@/test/utils";
import { TopBar } from "@/components/TopBar";

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

// Mock update store
vi.mock("@/store/updateStore", () => ({
  useUpdateStore: () => ({
    shouldShowNotification: () => false,
    shouldHighlightNotification: () => false,
    updateVersion: "1.0.0",
  }),
}));

// Mock theme store
vi.mock("@/store/themeStore", () => ({
  useThemeStore: (selector: any) => {
    const state = {
      theme: "light",
      toggleTheme: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

describe("TopBar", () => {
  it("renders correctly", () => {
    renderWithUserEvent(
      <TopBar 
        onLoadPlaylists={async () => {}}
        onCloseAllPlaylists={() => {}}
      />
    );

    // Updated assertion to look for the heading instead of banner role
    expect(screen.getByText("AstraNotes")).toBeInTheDocument();
  });

  it("handles settings button click", async () => {
    const { user } = renderWithUserEvent(
      <TopBar 
        onLoadPlaylists={async () => {}}
        onCloseAllPlaylists={() => {}}
      />
    );

    // Find settings button in the rendered component
    const settingsButton = screen.getByRole("button", { name: /settings/i });
    expect(settingsButton).toBeInTheDocument();

    // Click the settings button
    await user.click(settingsButton);

    // Add assertions for expected behavior after click if needed
  });
});
