import React from "react";
import type { Preview } from "@storybook/react";
import "../src/index.css";
import { cn } from "../src/lib/utils";
import { ToastProvider } from "../src/components/ui/toast";
import { withMockStores } from './decorators';

export const decorators = [
  (Story) => (
    <div className="p-8">
      <Story />
    </div>
  ),
  (Story) => (
    <ToastProvider>
      <Story />
    </ToastProvider>
  ),
  withMockStores
];

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;