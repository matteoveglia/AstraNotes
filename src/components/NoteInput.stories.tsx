import type { Meta, StoryObj } from "@storybook/react";
import { NoteInput } from "./NoteInput";

const meta: Meta<typeof NoteInput> = {
  title: "Components/NoteInput",
  component: NoteInput,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    status: { 
      control: "select", 
      options: ["empty", "draft", "published"] 
    },
  },
};

export default meta;
type Story = StoryObj<typeof NoteInput>;

export const Empty: Story = {
  args: {
    versionName: "Shot_010",
    versionNumber: "1",
    status: "empty",
    selected: false,
    initialContent: "",
    onSave: (content, labelId) => console.log("Save", { content, labelId }),
    onClear: () => console.log("Clear"),
    onSelectToggle: () => console.log("Toggle Selection"),
  },
};

export const WithDraft: Story = {
  args: {
    versionName: "Shot_010",
    versionNumber: "1",
    status: "draft",
    selected: false,
    initialContent: "This is a draft note with some feedback on the shot.",
    onSave: (content, labelId) => console.log("Save", { content, labelId }),
    onClear: () => console.log("Clear"),
    onSelectToggle: () => console.log("Toggle Selection"),
    initialLabelId: ""
  },
};

export const Published: Story = {
  args: {
    versionName: "Shot_010",
    versionNumber: "1",
    status: "published",
    selected: false,
    initialContent: "This note has been published to the team.",
    onSave: (content, labelId) => console.log("Save", { content, labelId }),
    onClear: () => console.log("Clear"),
    onSelectToggle: () => console.log("Toggle Selection"),
  },
};

export const Selected: Story = {
  args: {
    versionName: "Shot_010",
    versionNumber: "1",
    status: "draft",
    selected: true,
    initialContent: "This is a selected note ready for batch publishing.",
    onSave: (content, labelId) => console.log("Save", { content, labelId }),
    onClear: () => console.log("Clear"),
    onSelectToggle: () => console.log("Toggle Selection"),
  },
};