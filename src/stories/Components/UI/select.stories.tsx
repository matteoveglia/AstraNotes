import type { Meta, StoryObj } from '@storybook/react';
import { Select } from '@/components/ui/select';

const meta: Meta<typeof Select> = {
  title: 'Components/UI/Select',
  component: Select,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Select>;

export const Primary: Story = {
  args: {},
};
