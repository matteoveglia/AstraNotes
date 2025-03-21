import type { Meta, StoryObj } from "@storybook/react";
import { TopBar } from "@/components/TopBar";
import { storyMocks } from "../../../.storybook/mocks";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";

// Define the window interfaces for our mocks
declare global {
  interface Window {
    mockConnectionStatus: {
      isConnected: boolean;
      testConnection: () => void;
      lastTested: number;
    };
    mockSettings: {
      settings: {
        serverUrl: string;
        apiKey: string;
        apiUser: string;
        autoRefreshEnabled: boolean;
        defaultLabelId: string;
      };
      setSettings: (newSettings: any) => void;
    };
    mockUpdateStore: {
      updateAvailable: boolean;
      updateVersion: string;
      firstNotifiedAt: number | null;
      shouldShowNotification: () => boolean;
      shouldHighlightNotification: () => boolean;
    };
    useConnectionStatus: () => typeof window.mockConnectionStatus;
    useSettings: () => typeof window.mockSettings;
    useUpdateStore: () => typeof window.mockUpdateStore;
  }
}

// Create a proper settings button that matches the actual component
const SettingsButton = () => (
  <Button variant="ghost" size="sm" className="h-8 px-2">
    <Settings className="h-4 w-4 mr-1" />
    Settings
  </Button>
);

const meta: Meta<typeof TopBar> = {
  title: "Components/TopBar",
  component: TopBar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TopBar>;

// Helper function to reset all mocks to default state
const resetMocks = () => {
  // Global mocks for the hooks used by TopBar
  window.mockConnectionStatus = {
    isConnected: true,
    testConnection: () => console.log("Connection tested"),
    lastTested: Date.now(),
  };

  window.mockSettings = {
    settings: {
      serverUrl: "https://example.ftrackapp.com",
      apiKey: "mock-api-key",
      apiUser: "user@example.com",
      autoRefreshEnabled: true,
      defaultLabelId: "",
    },
    setSettings: (newSettings) => {
      console.log("Settings updated:", newSettings);
      window.mockSettings.settings = newSettings;
    },
  };

  window.mockUpdateStore = {
    updateAvailable: false,
    updateVersion: "1.0.0",
    firstNotifiedAt: null,
    shouldShowNotification: () => window.mockUpdateStore.updateAvailable,
    shouldHighlightNotification: () => false,
  };

  // Mock hooks
  window.useConnectionStatus = () => window.mockConnectionStatus;
  window.useSettings = () => window.mockSettings;
  window.useUpdateStore = () => window.mockUpdateStore;
};

// Initialize mocks
resetMocks();

export const Connected: Story = {
  args: {
    children: <SettingsButton />,
  },
  render: (args) => {
    // Reset and ensure connected state
    resetMocks();
    window.mockConnectionStatus.isConnected = true;
    window.mockSettings.settings.autoRefreshEnabled = true;
    window.mockUpdateStore.updateAvailable = false;
    
    return <TopBar {...args} />;
  },
};

export const Disconnected: Story = {
  args: {
    children: <SettingsButton />,
  },
  render: (args) => {
    // Reset and set disconnected state
    resetMocks();
    window.mockConnectionStatus.isConnected = false;
    
    return <TopBar {...args} />;
  },
};

export const AutoUpdatesOff: Story = {
  args: {
    children: <SettingsButton />,
  },
  render: (args) => {
    // Reset and set auto updates off
    resetMocks();
    window.mockConnectionStatus.isConnected = true;
    window.mockSettings.settings.autoRefreshEnabled = false;
    
    return <TopBar {...args} />;
  },
};

export const UpdateAvailable: Story = {
  args: {
    children: <SettingsButton />,
  },
  render: (args) => {
    // Reset and set update available
    resetMocks();
    window.mockConnectionStatus.isConnected = true;
    window.mockUpdateStore.updateAvailable = true;
    window.mockUpdateStore.updateVersion = "1.1.0";
    window.mockUpdateStore.firstNotifiedAt = Date.now() - 1000 * 60 * 60 * 24; // 1 day ago
    
    // Override the shouldShowNotification function
    window.mockUpdateStore.shouldShowNotification = () => true;
    
    return <TopBar {...args} />;
  },
};

export const UpdateHighlighted: Story = {
  args: {
    children: <SettingsButton />,
  },
  render: (args) => {
    // Reset and set highlighted update (more than 5 days old)
    resetMocks();
    window.mockConnectionStatus.isConnected = true;
    window.mockUpdateStore.updateAvailable = true;
    window.mockUpdateStore.updateVersion = "1.1.0";
    window.mockUpdateStore.firstNotifiedAt = Date.now() - 1000 * 60 * 60 * 24 * 6; // 6 days ago
    
    // Override both notification functions
    window.mockUpdateStore.shouldShowNotification = () => true;
    window.mockUpdateStore.shouldHighlightNotification = () => true;
    
    return <TopBar {...args} />;
  },
};
