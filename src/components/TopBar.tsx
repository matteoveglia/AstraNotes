/**
 * @fileoverview TopBar.tsx
 * Application header showing status and controls.
 * Includes connection status, auto-update indication, branding,
 * settings access, and connection state feedback.
 * @component
 */

import React, { useMemo } from "react";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { ArrowUpCircle } from "lucide-react";
import { useUpdateStore } from "../store/updateStore";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "../store/themeStore";
import { WhatsNewModal } from "./WhatsNewModal";
import { SettingsModal } from "./SettingsModal";
import { ProjectSelector } from "./ProjectSelector";
import { motion } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppModeStore } from "@/store/appModeStore";

interface TopBarProps {
  onLoadPlaylists: () => Promise<void>;
  onCloseAllPlaylists: () => void;
  onProjectChange?: (projectId: string | null) => void;
  shouldShowWhatsNew?: boolean;
  onWhatsNewClose?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onLoadPlaylists,
  onCloseAllPlaylists,
  onProjectChange,
  shouldShowWhatsNew = false,
  onWhatsNewClose,
}) => {
  const { isConnected, connecting, justPolled } = useConnectionStatus();
  const { shouldShowNotification, shouldHighlightNotification } =
    useUpdateStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const { appMode } = useAppModeStore();
  const isDemoMode = appMode === "demo";

  const topBarBackground = useMemo(() => {
    if (theme === "dark") {
      return isDemoMode
        ? "oklch(0.2016 0.0474 138.18)" // Demo Mode
        : "oklch(0.19 0.0491 311.56)"; // ftrack Mode
    }
    return isDemoMode
      ? "oklch(0.9951 0.0049 138.18)" // Demo Mode
      : "oklch(0.9851 0.0056 311.65)"; // ftrack Mode
  }, [isDemoMode, theme]);

  return (
    <TooltipProvider>
      <div
        className="h-12 border-b flex items-center justify-between px-4"
        style={{ backgroundColor: topBarBackground }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 select-none">
              AstraNotes
            </h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  {isDemoMode ? (
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
                  ) : connecting ? (
                    // Connecting: orange pulsing (infinite)
                    <motion.div
                      className="w-2.5 h-2.5 bg-orange-500 rounded-full"
                      animate={{ scale: [1, 1.25, 1], opacity: [1, 0.6, 1] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  ) : isConnected ? (
                    // Connected: static green with one-time pulse right after a successful poll
                    justPolled ? (
                      <motion.div
                        className="w-2.5 h-2.5 bg-green-500 rounded-full"
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
                        transition={{ duration: 0.7, ease: "easeInOut" }}
                      />
                    ) : (
                      <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
                    )
                  ) : (
                    // Disconnected: red pulsing (infinite)
                    <motion.div
                      className="w-2.5 h-2.5 bg-red-500 rounded-full"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isDemoMode
                    ? "Demo Mode"
                    : connecting
                      ? "Connecting..."
                      : isConnected
                        ? "Connected"
                        : "Disconnected"}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          <ProjectSelector onProjectChange={onProjectChange} />
        </div>
        <div className="flex items-center gap-2">
          {isDemoMode && (
            <motion.div
              role="status"
              aria-live="polite"
              className="flex items-center gap-1 rounded-full border border-emerald-300/60 dark:border-emerald-800/60 bg-gradient-to-r from-green-100 via-emerald-100 to-green-200 dark:from-emerald-900/70 dark:via-emerald-800/70 dark:to-emerald-900/70 px-3 py-1 text-xs font-medium text-emerald-900 dark:text-emerald-200 shadow-sm"
              animate={{ opacity: [1, 0.85, 1], scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <span>Demo Mode</span>
            </motion.div>
          )}
          {shouldShowNotification() && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <ArrowUpCircle
                    className={`w-4 h-4 ${shouldHighlightNotification() ? "text-red-500" : "text-orange-500"}`}
                  />
                  <span
                    className={`text-sm font-medium ${shouldHighlightNotification() ? "text-red-600" : "text-orange-600"}`}
                  >
                    Update Available
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Go to Settings to update</p>
              </TooltipContent>
            </Tooltip>
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
          <WhatsNewModal
            autoShow={shouldShowWhatsNew}
            onModalShouldClose={onWhatsNewClose}
          />
          <SettingsModal
            onboardingTargetId="settings-button"
            onLoadPlaylists={onLoadPlaylists}
            onCloseAllPlaylists={onCloseAllPlaylists}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};
