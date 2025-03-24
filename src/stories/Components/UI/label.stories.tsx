import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Label> = {
  title: "Components/UI/Label",
  component: Label,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Label>;

export const Primary: Story = {
  args: {
    children: "Label",
  },
};
