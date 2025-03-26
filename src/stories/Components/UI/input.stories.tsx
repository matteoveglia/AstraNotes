import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "@/components/ui/input";

const meta: Meta<typeof Input> = {
  title: "Components/UI/Input",
  component: Input,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Primary: Story = {
  args: {
    placeholder: "Enter text...",
  },
};
