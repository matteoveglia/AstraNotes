import type { Meta, StoryObj } from "@storybook/react";
import { VersionSearch } from "@/components/VersionSearch";
import { AssetVersion } from "@/types";
import React, { useEffect } from "react";

// Mock data for versions
const mockVersions: AssetVersion[] = [
  {
    id: "version-1",
    name: "Shot_010",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/shot010v1/300/200",
    createdAt: new Date(2025, 2, 15).toISOString(),
    updatedAt: new Date(2025, 2, 15).toISOString(),
  },
  {
    id: "version-2",
    name: "Shot_010",
    version: 2,
    thumbnailUrl: "https://picsum.photos/seed/shot010v2/300/200",
    createdAt: new Date(2025, 2, 16).toISOString(),
    updatedAt: new Date(2025, 2, 16).toISOString(),
  },
  {
    id: "version-3",
    name: "Shot_020",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/shot020v1/300/200",
    createdAt: new Date(2025, 2, 17).toISOString(),
    updatedAt: new Date(2025, 2, 17).toISOString(),
  },
  {
    id: "version-4",
    name: "Shot_020",
    version: 2,
    thumbnailUrl: "https://picsum.photos/seed/shot020v2/300/200",
    createdAt: new Date(2025, 2, 18).toISOString(),
    updatedAt: new Date(2025, 2, 18).toISOString(),
  },
  {
    id: "version-5",
    name: "Shot_030",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/shot030v1/300/200",
    createdAt: new Date(2025, 2, 19).toISOString(),
    updatedAt: new Date(2025, 2, 19).toISOString(),
  },
  {
    id: "version-6",
    name: "Shot_030",
    version: 2,
    thumbnailUrl: "https://picsum.photos/seed/shot030v2/300/200",
    createdAt: new Date(2025, 2, 20).toISOString(),
    updatedAt: new Date(2025, 2, 20).toISOString(),
  },
  {
    id: "version-7",
    name: "Character_Main",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/char1/300/200",
    createdAt: new Date(2025, 2, 21).toISOString(),
    updatedAt: new Date(2025, 2, 21).toISOString(),
  },
  {
    id: "version-8",
    name: "Environment_Forest",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/env1/300/200",
    createdAt: new Date(2025, 2, 22).toISOString(),
    updatedAt: new Date(2025, 2, 22).toISOString(),
  },
];

// Mock versions already in playlist
const mockCurrentVersions: AssetVersion[] = [
  {
    id: "version-1",
    name: "Shot_010",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/shot010v1/300/200",
    createdAt: new Date(2025, 2, 15).toISOString(),
    updatedAt: new Date(2025, 2, 15).toISOString(),
  },
  {
    id: "version-3",
    name: "Shot_020",
    version: 1,
    thumbnailUrl: "https://picsum.photos/seed/shot020v1/300/200",
    createdAt: new Date(2025, 2, 17).toISOString(),
    updatedAt: new Date(2025, 2, 17).toISOString(),
  },
];

// Define the type for the filter function
type FilterFunction = (searchTerm: string) => AssetVersion[];

// Define the props for the wrapper component
interface VersionSearchWrapperProps {
  args: any;
  autoPopulateSearch?: boolean;
  filterFn?: FilterFunction | null;
  initialSearchTerm?: string;
}

// Create a wrapper component that will handle the mock setup and auto-populate search results
const VersionSearchWrapper: React.FC<VersionSearchWrapperProps> = ({
  args,
  autoPopulateSearch = false,
  filterFn = null,
  initialSearchTerm = "",
}) => {
  // Set up the mock ftrackService for this story
  useEffect(() => {
    // Create a mock implementation of ftrackService
    const mockFtrackService = {
      searchVersions: async ({ searchTerm }: { searchTerm: string }) => {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 200));

        // If no search term and not auto-populating, return empty array
        if (!searchTerm && !autoPopulateSearch) return [];

        // If we have a custom filter function, use it
        if (filterFn) {
          return filterFn(searchTerm);
        }

        // Default search behavior - match any part of the name or version
        const lowerSearchTerm = searchTerm.toLowerCase();
        return mockVersions.filter((version) => {
          const lowerName = version.name.toLowerCase();
          const versionString = `v${version.version}`;
          return (
            lowerName.includes(lowerSearchTerm) ||
            versionString.includes(searchTerm)
          );
        });
      },
      testConnection: () => Promise.resolve(true),
      updateSettings: () => console.log("Settings updated"),
    };

    // @ts-ignore - We're adding this for the story
    (window as any).ftrackService = mockFtrackService;

    // If we have an initial search term, we need to trigger the search input
    if (initialSearchTerm && autoPopulateSearch) {
      // Find the search input and set its value
      setTimeout(() => {
        const searchInput = document.querySelector(
          'input[placeholder*="Search"]',
        ) as HTMLInputElement;
        if (searchInput) {
          // Set the value and dispatch an input event
          searchInput.value = initialSearchTerm;
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, 100);
    }
  }, [autoPopulateSearch, filterFn, initialSearchTerm]);

  return <VersionSearch {...args} />;
};

const meta: Meta<typeof VersionSearch> = {
  title: "Components/VersionSearch",
  component: VersionSearch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "800px", padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof VersionSearch>;

export const Default: Story = {
  args: {
    onVersionSelect: (version: AssetVersion) =>
      console.log("Version selected:", version),
    onVersionsSelect: (versions: AssetVersion[]) =>
      console.log("Multiple versions selected:", versions),
    onClearAdded: () => console.log("Cleared added versions"),
    hasManuallyAddedVersions: false,
    isQuickNotes: false,
    currentVersions: [],
  },
  render: (args) => (
    <VersionSearchWrapper args={args} autoPopulateSearch={false} />
  ),
};

export const WithCurrentVersions: Story = {
  args: {
    onVersionSelect: (version: AssetVersion) =>
      console.log("Version selected:", version),
    onVersionsSelect: (versions: AssetVersion[]) =>
      console.log("Multiple versions selected:", versions),
    onClearAdded: () => console.log("Cleared added versions"),
    hasManuallyAddedVersions: true,
    isQuickNotes: false,
    currentVersions: mockCurrentVersions,
  },
  render: (args) => (
    <VersionSearchWrapper args={args} autoPopulateSearch={false} />
  ),
};

export const QuickNotesMode: Story = {
  args: {
    onVersionSelect: (version: AssetVersion) =>
      console.log("Version selected:", version),
    onVersionsSelect: (versions: AssetVersion[]) =>
      console.log("Multiple versions selected:", versions),
    onClearAdded: () => console.log("Cleared added versions"),
    hasManuallyAddedVersions: true,
    isQuickNotes: true,
    currentVersions: mockCurrentVersions,
  },
  render: (args) => (
    <VersionSearchWrapper args={args} autoPopulateSearch={false} />
  ),
};

// Helper component to demonstrate the search functionality with pre-filled search
export const WithPrefilledSearch: Story = {
  args: {
    onVersionSelect: (version: AssetVersion) =>
      console.log("Version selected:", version),
    onVersionsSelect: (versions: AssetVersion[]) =>
      console.log("Multiple versions selected:", versions),
    onClearAdded: () => console.log("Cleared added versions"),
    hasManuallyAddedVersions: false,
    isQuickNotes: false,
    currentVersions: mockCurrentVersions,
  },
  render: (args) => (
    <VersionSearchWrapper
      args={args}
      autoPopulateSearch={true}
      initialSearchTerm="s"
      filterFn={(searchTerm: string) =>
        mockVersions.filter((v) => v.name.toLowerCase().includes("shot"))
      }
    />
  ),
};

// Story to demonstrate multi-selection mode
export const MultiSelectionMode: Story = {
  args: {
    onVersionSelect: (version: AssetVersion) =>
      console.log("Version selected:", version),
    onVersionsSelect: (versions: AssetVersion[]) =>
      console.log("Multiple versions selected:", versions),
    onClearAdded: () => console.log("Cleared added versions"),
    hasManuallyAddedVersions: false,
    isQuickNotes: false,
    currentVersions: [],
  },
  render: (args) => (
    <VersionSearchWrapper
      args={args}
      autoPopulateSearch={true}
      filterFn={() => mockVersions} // Return all versions
    />
  ),
};
