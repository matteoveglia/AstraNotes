import type { Meta, StoryObj } from "@storybook/react";
import { BorderTrail } from "@/components/ui/border-trail";

const meta: Meta<typeof BorderTrail> = {
  title: "Components/UI/BorderTrail",
  component: BorderTrail,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof BorderTrail>;

export const Primary: Story = {
  args: {},
};
