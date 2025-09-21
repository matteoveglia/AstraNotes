import React from "react";
import { ToastProvider } from "./ui/toast";
import { ErrorBoundary } from "./ui/error-boundary";
import { SyncConflictManager } from "@/features/playlists/components";

interface AppProviderProps {
  children: React.ReactNode;
}

/**
 * AppProvider
 * ------------
 * Consolidates global React providers that were previously scattered between
 * `main.tsx` and `App.tsx`. By wrapping the entire application with this
 * component, we keep `main.tsx` concise and make it easier to add/adjust
 * providers in one place.
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  return (
    <ToastProvider>
      {/* Cross-playlist sync-conflict modal logic lives at the root level */}
      <SyncConflictManager />
      {/* Top-level error boundary so uncaught errors surface gracefully */}
      <ErrorBoundary>{children}</ErrorBoundary>
    </ToastProvider>
  );
};

export default AppProvider;
