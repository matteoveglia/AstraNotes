/**
 * @fileoverview WhatsNewModal.stories.tsx
 * Storybook stories for the WhatsNewModal component.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { GitHubRelease } from "@/services/githubService";

// Mock release data for stories
const mockRelease: GitHubRelease = {
  tag_name: "v0.7.1",
  name: "AstraNotes v0.7.1 - Enhanced Note Management",
  body: `# What's New in v0.7.1

## 🚀 New Features
- **Enhanced Note Editor**: Improved markdown editing experience with better syntax highlighting
- **Smart Auto-Save**: Notes are now automatically saved as you type
- **Quick Actions**: Added keyboard shortcuts for common actions

## 🐛 Bug Fixes
- Fixed issue with note synchronization
- Resolved playlist loading performance issues
- Fixed dark mode theme inconsistencies

## 🔧 Improvements
- Better error handling and user feedback
- Improved application startup time
- Enhanced accessibility features

## 📝 Technical Changes
- Updated to latest Tauri version
- Improved database performance
- Better memory management`,
  published_at: "2024-01-15T10:30:00Z",
  html_url: "https://github.com/matteoveglia/AstraNotes/releases/tag/v0.7.1",
  prerelease: false,
  draft: false,
};

// Mock the services and stores for Storybook
const mockGithubService = {
  getLatestRelease: () => Promise.resolve(mockRelease),
  formatReleaseNotes: (content: string) => content,
};

const mockWhatsNewStore = {
  cachedRelease: null,
  lastFetchedAt: null,
  setCachedRelease: () => {},
  markAsShown: () => {},
};

// Note: Mocks would be configured in a separate setup file for Storybook

const meta: Meta<typeof WhatsNewModal> = {
  title: "Components/WhatsNewModal",
  component: WhatsNewModal,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Modal for displaying release notes and what's new information from GitHub releases.",
      },
    },
  },
  argTypes: {
    autoShow: {
      control: "boolean",
      description: "Whether to show the modal automatically",
    },
    onModalShouldClose: {
      action: "closed",
      description: "Callback when modal is closed",
    },
  },
};

export default meta;
type Story = StoryObj<typeof WhatsNewModal>;

export const Default: Story = {
  args: {},
  render: (args) => {
    return <WhatsNewModal {...args} />;
  },
};

export const AutoShow: Story = {
  args: {
    autoShow: true,
  },
  render: (args) => {
    return <WhatsNewModal {...args} />;
  },
};

export const WithCachedData: Story = {
  args: {
    autoShow: true,
  },
  render: (args) => {
    // Override the store to return cached data
    const storeWithCache = {
      ...mockWhatsNewStore,
      cachedRelease: mockRelease,
      lastFetchedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
    };

    vi.mock("@/store/whatsNewStore", () => ({
      useWhatsNewStore: () => storeWithCache,
    }));

    return <WhatsNewModal {...args} />;
  },
}; 