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
import * as SwitchPrimitives from "@radix-ui/react-switch";
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
        <h1 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
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
        <SwitchPrimitives.Root
          id="theme-toggle"
          checked={theme === "dark"}
          onCheckedChange={toggleTheme}
          className={cn(
            "relative inline-flex items-center h-8 w-14 rounded-full p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-background",
            "bg-zinc-100 dark:bg-zinc-900",
          )}
        >
          <Sun className="absolute left-2 w-4 h-4 text-zinc-400" />
          <Moon className="absolute right-2 w-4 h-4 text-zinc-400" />
          <SwitchPrimitives.Thumb
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded-full shadow-md transform transition-transform",
              "bg-amber-500 data-[state=checked]:bg-indigo-800",
              "data-[state=checked]:translate-x-6",
            )}
          >
            {theme === "dark" ? (
              <Moon className="w-4 h-4 text-white" />
            ) : (
              <Sun className="w-4 h-4 text-white" />
            )}
          </SwitchPrimitives.Thumb>
        </SwitchPrimitives.Root>
        {children}
      </div>
    </div>
  );
};
