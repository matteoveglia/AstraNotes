import type { Meta, StoryObj } from '@storybook/react';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

export const Primary: Story = {
  args: {},
};
