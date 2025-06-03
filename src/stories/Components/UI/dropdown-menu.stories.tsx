import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type DropdownMenuProps = React.ComponentProps<typeof DropdownMenu> & {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  trigger?: React.ReactNode;
  items?: Array<{
    label: string;
    icon?: string;
    onClick?: () => void;
  }>;
};

const meta: Meta<DropdownMenuProps> = {
  title: "Components/UI/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  argTypes: {
    align: {
      control: { type: "select" },
      options: ["start", "center", "end"],
    },
    side: {
      control: { type: "select" },
      options: ["top", "right", "bottom", "left"],
    },
  },
};

export default meta;

type Story = StoryObj<DropdownMenuProps>;

export const Primary: Story = {
  args: {
    trigger: <Button>Open Menu</Button>,
    items: [
      { label: "Item 1", onClick: () => console.log("Item 1 clicked") },
      { label: "Item 2", onClick: () => console.log("Item 2 clicked") },
      { label: "Item 3", onClick: () => console.log("Item 3 clicked") },
    ],
    align: "start",
    side: "bottom",
  },
};

export const WithIcons: Story = {
  args: {
    ...Primary.args,
    items: [
      {
        label: "Edit",
        icon: "edit",
        onClick: () => console.log("Edit clicked"),
      },
      {
        label: "Delete",
        icon: "trash",
        onClick: () => console.log("Delete clicked"),
      },
      {
        label: "Share",
        icon: "share",
        onClick: () => console.log("Share clicked"),
      },
    ],
  },
};

export const RightAligned: Story = {
  args: {
    ...Primary.args,
    align: "end",
  },
};

export const TopPositioned: Story = {
  args: {
    ...Primary.args,
    side: "top",
  },
};
