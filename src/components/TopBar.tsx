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
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "../store/themeStore";

interface TopBarProps {
  children: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ children }) => {
  const { isConnected } = useConnectionStatus();
  const { settings } = useSettings();
  const { shouldShowNotification, shouldHighlightNotification, updateVersion } =
    useUpdateStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <div className="h-12 border-b bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
          AstraNotes
        </h1>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-sm">
          {isConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-400">
                Connected
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-400">
                Disconnected
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {!settings.autoRefreshEnabled && (
          <span className="text-sm text-zinc-400">Auto Updates Off</span>
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
        <button
          onClick={toggleTheme}
          className={cn(
            "relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 ease-in-out",
            "hover:bg-zinc-100 dark:hover:bg-zinc-800",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500",
            "bg-white dark:bg-zinc-900",
          )}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <div className="relative w-5 h-5">
            <Sun
              className={cn(
                "absolute inset-0 w-5 h-5 text-amber-500 transition-all duration-300 ease-in-out transform",
                theme === "dark"
                  ? "opacity-0 rotate-90 scale-75"
                  : "opacity-100 rotate-0 scale-100",
              )}
            />
            <Moon
              className={cn(
                "absolute inset-0 w-5 h-5 text-slate-700 dark:text-slate-300 transition-all duration-300 ease-in-out transform",
                theme === "dark"
                  ? "opacity-100 rotate-0 scale-100"
                  : "opacity-0 -rotate-90 scale-75",
              )}
            />
          </div>
        </button>
        {children}
      </div>
    </div>
  );
};
