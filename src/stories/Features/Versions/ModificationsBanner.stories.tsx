import type { Meta, StoryObj } from "@storybook/react";
import { ModificationsBanner } from "@/features/versions/components/ModificationsBanner";
import { AssetVersion } from "@/types";

const meta: Meta<typeof ModificationsBanner> = {
  title: "Features/Versions/ModificationsBanner",
  component: ModificationsBanner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ModificationsBanner>;

const mockVersions: AssetVersion[] = [
  {
    id: "ver-001",
    name: "Shot_010",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ver-002",
    name: "Shot_020",
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const AddedVersions: Story = {
  args: {
    addedCount: 2,
    removedCount: 0,
    onUpdate: () => console.log("Update clicked"),
    isUpdating: false,
    addedVersions: mockVersions,
    removedVersions: [],
  },
};

export const RemovedVersions: Story = {
  args: {
    addedCount: 0,
    removedCount: 2,
    onUpdate: () => console.log("Update clicked"),
    isUpdating: false,
    addedVersions: [],
    removedVersions: mockVersions,
  },
};

export const BothChanges: Story = {
  args: {
    addedCount: 2,
    removedCount: 3,
    onUpdate: () => console.log("Update clicked"),
    isUpdating: false,
    addedVersions: mockVersions,
    removedVersions: [
      ...mockVersions,
      { ...mockVersions[0], id: "ver-003", name: "Shot_030" },
    ],
  },
};

export const Updating: Story = {
  args: {
    addedCount: 2,
    removedCount: 1,
    onUpdate: () => console.log("Update clicked"),
    isUpdating: true,
    addedVersions: mockVersions,
    removedVersions: [mockVersions[0]],
  },
};
