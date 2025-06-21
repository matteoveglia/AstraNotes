/**
 * @fileoverview TopBar.tsx
 * Application header showing status and controls.
 * Includes connection status, auto-update indication, branding,
 * settings access, and connection state feedback.
 * @component
 */

import React from "react";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { ArrowUpCircle } from "lucide-react";
import { useSettings } from "../store/settingsStore";
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
  const { isConnected } = useConnectionStatus();
  const { settings } = useSettings();
  const { shouldShowNotification, shouldHighlightNotification, updateVersion } =
    useUpdateStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <TooltipProvider>
      <div className="h-12 border-b bg-background flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 select-none">
              AstraNotes
            </h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  {isConnected ? (
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
                  ) : (
                    <motion.div
                      className="w-2.5 h-2.5 bg-red-500 rounded-full"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.7, 1],
                      }}
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
                <p>{isConnected ? "Connected" : "Disconnected"}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <ProjectSelector onProjectChange={onProjectChange} />
        </div>
        <div className="flex items-center gap-1">
          {!settings.autoRefreshEnabled && (
            <span className="text-sm text-zinc-400">Auto Updates Off</span>
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
            onLoadPlaylists={onLoadPlaylists}
            onCloseAllPlaylists={onCloseAllPlaylists}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};
