import type { Meta, StoryObj } from "@storybook/react";
import { PublishingControls } from '@/features/notes/components/PublishingControls';

const meta: Meta<typeof PublishingControls> = {
  title: "Features/Notes/PublishingControls",
  component: PublishingControls,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PublishingControls>;

export const NoSelection: Story = {
  args: {
    selectedCount: 0,
    draftCount: 5,
    isPublishing: false,
    onPublishSelected: () => console.log("Publish selected clicked"),
    onPublishAll: () => console.log("Publish all clicked"),
    onClearAllNotes: () => console.log("Clear all notes clicked"),
    onSetAllLabels: (labelId) =>
      console.log("Set all labels clicked with labelId:", labelId),
  },
};

export const WithSelection: Story = {
  args: {
    selectedCount: 3,
    draftCount: 5,
    isPublishing: false,
    onPublishSelected: () => console.log("Publish selected clicked"),
    onPublishAll: () => console.log("Publish all clicked"),
    onClearAllNotes: () => console.log("Clear all notes clicked"),
    onSetAllLabels: (labelId) =>
      console.log("Set all labels clicked with labelId:", labelId),
  },
};

export const Publishing: Story = {
  args: {
    selectedCount: 3,
    draftCount: 5,
    isPublishing: true,
    onPublishSelected: () => console.log("Publish selected clicked"),
    onPublishAll: () => console.log("Publish all clicked"),
    onClearAllNotes: () => console.log("Clear all notes clicked"),
    onSetAllLabels: (labelId) =>
      console.log("Set all labels clicked with labelId:", labelId),
  },
};
