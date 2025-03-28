/**
 * @fileoverview TopBar.tsx
 * Application header showing status and controls.
 * Includes connection status, auto-update indication, branding,
 * settings access, and connection state feedback.
 * @component
 */

import React from "react";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { CheckCircle2, XCircle, ArrowUpCircle } from "lucide-react";
import { useSettings } from "../store/settingsStore";
import { useUpdateStore } from "../store/updateStore";

interface TopBarProps {
  children: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ children }) => {
  const { isConnected } = useConnectionStatus();
  const { settings } = useSettings();
  const { shouldShowNotification, shouldHighlightNotification, updateVersion } =
    useUpdateStore();

  return (
    <div className="h-12 border-b bg-white flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-900">AstraNotes</h1>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-sm">
          {isConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-green-700">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-700">Disconnected</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {!settings.autoRefreshEnabled && (
          <span className="text-sm text-gray-400">Auto Updates Off</span>
        )}
        {shouldShowNotification() && (
          <div className="flex items-center gap-1.5">
            <ArrowUpCircle
              className={`w-4 h-4 ${shouldHighlightNotification() ? "text-red-500" : "text-orange-500"}`}
            />
            <span
              className={`text-sm font-medium ${shouldHighlightNotification() ? "text-red-600" : "text-orange-600"}`}
            >
              Update Available
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
