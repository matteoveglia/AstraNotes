import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from '@/components/ui/textarea';

const meta: Meta<typeof Textarea> = {
  title: 'Components/UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Primary: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};
