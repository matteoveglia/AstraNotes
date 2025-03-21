import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from '@/components/ui/switch';

const meta: Meta<typeof Switch> = {
  title: 'Components/UI/Switch',
  component: Switch,
  tags: ['autodocs'],
};
  
export default meta;

type Story = StoryObj<typeof Switch>;

export const Primary: Story = {
  args: {},
};
