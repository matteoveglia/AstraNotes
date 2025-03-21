import type { Meta, StoryObj } from '@storybook/react';
import { GlowEffect } from '@/components/ui/glow-effect';

const meta: Meta<typeof GlowEffect> = {
  title: 'Components/UI/GlowEffect',
  component: GlowEffect,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof GlowEffect>;

export const Primary: Story = {
  args: {},
};
