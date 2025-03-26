import type { Meta, StoryObj } from "@storybook/react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DialogProps = React.ComponentProps<typeof Dialog> & {
  size?: "sm" | "md" | "lg";
  showCloseButton?: boolean;
  trigger?: React.ReactNode;
  title?: string;
};

const meta: Meta<DialogProps> = {
  title: "Components/UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    showCloseButton: {
      control: { type: "boolean" },
    },
  },
};

export default meta;

type Story = StoryObj<DialogProps>;

export const Primary: Story = {
  args: {
    trigger: <Button>Open Dialog</Button>,
    title: "Dialog Title",
    children: "Dialog Content",
    size: "md",
    showCloseButton: true,
  },
};

export const Small: Story = {
  args: {
    ...Primary.args,
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    ...Primary.args,
    size: "lg",
  },
};

export const WithoutCloseButton: Story = {
  args: {
    ...Primary.args,
    showCloseButton: false,
  },
};
