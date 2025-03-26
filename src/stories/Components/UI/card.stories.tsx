import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "@/components/ui/card";

const meta: Meta<typeof Card> = {
  title: "Components/UI/Card",
  component: Card,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Primary: Story = {
  args: {
    children: "Card Content",
  },
};
