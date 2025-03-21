import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, type TooltipProps } from '@/components/ui/tooltip';

const meta: Meta<TooltipProps> = {
  title: 'Components/UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  argTypes: {
    side: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'],
    },
    content: {
      control: 'text',
    },
  },
};

export default meta;

type Story = StoryObj<TooltipProps>;

export const Default: Story = {
  args: {
    content: 'This is a tooltip',
    side: 'top',
  },
  render: (args) => (
    <Tooltip>
      <TooltipTrigger>Hover me</TooltipTrigger>
      <TooltipContent side={args.side}>
        <p>{args.content}</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const VersionInformation: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>Version Details</TooltipTrigger>
      <TooltipContent className="w-80">
        <h3 className="font-bold">Version Information</h3>
        <div className="space-y-2 text-sm">
          <p><strong>Version:</strong> 1.2.3</p>
          <p><strong>Status:</strong> Approved</p>
          <p><strong>Release Date:</strong> 2025-03-15</p>
          <p><strong>Changes:</strong>
            <ul className="list-disc pl-4">
              <li>Improved performance</li>
              <li>Fixed critical bugs</li>
              <li>Added new features</li>
            </ul>
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  ),
};
