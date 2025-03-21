import type { Meta, StoryObj } from "@storybook/react";
import { SettingsModal } from "@/components/SettingsModal";
import { storyMocks } from "../../../.storybook/mocks";

declare global {
  interface Window {
    mockStores: {
      settings: {
        serverUrl: string;
        apiKey: string;
        apiUser: string;
        autoRefreshEnabled: boolean;
        defaultLabelId: string;
      };
      labels: Array<{
        id: string;
        name: string;
        color: string;
      }>;
    };
    useSettings: () => {
      settings: typeof window.mockStores.settings;
      setSettings: (newSettings: any) => void;
    };
    useLabelStore: () => {
      labels: typeof window.mockStores.labels;
      fetchLabels: () => void;
      isLoading: boolean;
      error: null;
    };
    ftrackService: {
      testConnection: () => Promise<boolean>;
      updateSettings: () => void;
    };
  }
}

// Global mocks for the stores used by SettingsModal
window.mockStores = {
  settings: {
    serverUrl: "https://example.ftrackapp.com",
    apiKey: "mock-api-key",
    apiUser: "user@example.com",
    autoRefreshEnabled: true,
    defaultLabelId: "label-1",
  },
  labels: [
    { id: "label-1", name: "Bug", color: "#ff0000" },
    { id: "label-2", name: "Feature", color: "#00ff00" },
  ],
};

// Mock store hooks
window.useSettings = () => ({
  settings: window.mockStores.settings,
  setSettings: (newSettings: any) => {
    console.log("Settings updated:", newSettings);
    window.mockStores.settings = newSettings;
  },
});

window.useLabelStore = () => ({
  labels: window.mockStores.labels,
  fetchLabels: () => console.log("Labels fetched"),
  isLoading: false,
  error: null,
});

window.ftrackService = {
  testConnection: () => Promise.resolve(true),
  updateSettings: () => console.log("Settings updated"),
};

const meta: Meta<typeof SettingsModal> = {
  title: "Components/SettingsModal",
  component: SettingsModal,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => {
      return (
        <div style={{ width: "800px", height: "600px" }}>
          <Story />
        </div>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsModal>;

export const Default: Story = {
  args: {
    onLoadPlaylists: async () => console.log("Playlists loaded"),
    onCloseAllPlaylists: () => console.log("All playlists closed"),
  },
  render: (args) => {
    return <SettingsModal {...args} />;
  },
};
