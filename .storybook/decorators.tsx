import React from 'react';
import { ToastProvider } from "../src/components/ui/toast";

// Create a mock store provider if needed
export const withMockStores = (Story) => {
  return (
    <div className="mock-stores">
      <ToastProvider>
        <Story />
      </ToastProvider>
    </div>
  );
};