import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Toast } from "@/components/ui/toast";

type ToastProps = React.ComponentProps<typeof Toast> & {
  title?: string;
  description?: string;
};

const meta: Meta<ToastProps> = {
  title: "Components/UI/Toast",
  component: Toast,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<ToastProps>;

export const Primary: Story = {
  args: {
    title: "Toast Title",
    description: "This is a toast message",
  },
};
