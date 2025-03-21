import type { Meta, StoryObj } from '@storybook/react';
import { AlertDialog } from '@/components/ui/alert-dialog';

const meta: Meta<typeof AlertDialog> = {
  title: 'Components/UI/AlertDialog',
  component: AlertDialog,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof AlertDialog>;

export const Primary: Story = {
  args: {},
};
