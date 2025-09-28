/**
 * @fileoverview SettingsModal.tsx
 * Modal for application settings management.
 * Features FTrack connection settings, auto-refresh toggles,
 * label selection, cache management, updates, and connection testing.
 * @component
 */

import React, { useState, useEffect } from "react";
import { Settings, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ftrackAuthService } from "../services/ftrack/FtrackAuthService";
import { db } from "../store/db";
import { playlistStore } from "../store/playlist";
import { useSettings } from "../store/settingsStore";
import { useLabelStore } from "../store/labelStore";
import { useThumbnailSettingsStore } from "../store/thumbnailSettingsStore";
import { clearThumbnailCache } from "../services/thumbnailService";
import { usePlaylistsStore } from "../store/playlistsStore";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { installUpdate, silentCheckForUpdates } from "../lib/updater";
import { exportLogs } from "../lib/logExporter";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdateStore } from "../store/updateStore";
import { GlowEffect } from "@/components/ui/glow-effect";
import { useAppModeStore, type AppMode } from "@/store/appModeStore";
import { switchAppMode } from "@/services/appMode/switchAppMode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOnboardingStore } from "@/store/onboardingStore";
import { emitOnboardingEvent } from "@/onboarding/events";

interface SettingsModalProps {
  onLoadPlaylists: () => Promise<void>;
  onCloseAllPlaylists: () => void;
  onboardingTargetId?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onLoadPlaylists,
  onCloseAllPlaylists,
  onboardingTargetId,
}) => {
  const shouldOpenSettingsModal = useOnboardingStore(
    (s) => s.shouldOpenSettingsModal,
  );
  const setShouldOpenSettingsModal = useOnboardingStore(
    (s) => s.setShouldOpenSettingsModal,
  );
  const resetOnboardingProgress = useOnboardingStore((s) => s.resetProgress);
  const startOnboarding = useOnboardingStore((s) => s.start);
  const requestTutorialStart = useOnboardingStore((s) => s.requestStart);
  const [isOpen, setIsOpen] = useState(false);
  const { settings, setSettings } = useSettings();
  const { labels, fetchLabels } = useLabelStore();
  const { size, setSize } = useThumbnailSettingsStore();
  const { isConnected, testConnection } = useConnectionStatus();
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const { updateAvailable, updateVersion } = useUpdateStore();
  const { appMode } = useAppModeStore();
  const isDemoMode = appMode === "demo";
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isTutorialDialogOpen, setIsTutorialDialogOpen] = useState(false);
  const [isStartingTutorial, setIsStartingTutorial] = useState(false);

  const handleDialogOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setShouldOpenSettingsModal(false);
    }
  };

  useEffect(() => {
    if (shouldOpenSettingsModal && !isOpen) {
      setIsOpen(true);
    }
  }, [shouldOpenSettingsModal, isOpen]);

  useEffect(() => {
    if (isOpen) {
      emitOnboardingEvent("settingsOpen");
      if (shouldOpenSettingsModal) {
        setShouldOpenSettingsModal(false);
      }
    }
  }, [isOpen, shouldOpenSettingsModal, setShouldOpenSettingsModal]);

  const handleReplayTutorial = () => {
    resetOnboardingProgress();
    setShouldOpenSettingsModal(false);
    handleDialogOpenChange(false);
    setTimeout(() => {
      startOnboarding(0);
    }, 0);
  };

  useEffect(() => {
    if (isOpen) {
      fetchLabels();
      // Get app version
      getVersion()
        .then((version) => {
          setAppVersion(version);
        })
        .catch((err) => {
          console.error("Failed to get app version:", err);
        });
    }
  }, [isOpen, fetchLabels]);

  const handleSave = async () => {
    try {
      if (isDemoMode) {
        return;
      }

      setIsLoading(true);
      // Update service settings
      ftrackAuthService.updateSettings(settings);

      // Test connection with new settings via hook to trigger global connecting pulse
      const connectionSuccess = await testConnection();
      if (connectionSuccess) {
        // Reload labels with new credentials, preserving current selection
        await fetchLabels();
      }

      // Close modal
      setIsOpen(false);

      // Reload playlists with new settings
      await onLoadPlaylists();
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings");
    } finally {
      setIsLoading(false);
      window.location.reload();
    }
  };

  const handleTestConnection = async () => {
    if (isDemoMode) {
      return;
    }

    setIsTesting(true);
    setError(null);

    try {
      // Update service settings before testing
      ftrackAuthService.updateSettings(settings);
      const ok = await testConnection();
      if (!ok) {
        setError("Failed to connect. Please check your credentials.");
      }
    } catch (err) {
      console.error("Connection error:", err);
      setError("An error occurred while testing the connection");
    } finally {
      setIsTesting(false);
    }
  };

  const handleInputChange =
    (field: keyof typeof settings) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isDemoMode) {
        return;
      }
      setSettings({ ...settings, [field]: e.target.value });
      // Reset error when settings change
      setError(null);
    };

  const performCacheReset = async () => {
    // Close the modal first
    setIsOpen(false);

    // Reset any polling that might be happening (legacy API; optional)
    (playlistStore as any).stopAutoRefresh?.();

    // Clear thumbnail cache
    clearThumbnailCache();

    // Reset UI state
    onCloseAllPlaylists();

    // Use the enhanced clearCache method that wipes ALL database tables
    // This includes the new unified tables and any legacy tables
    await db.clearCache();

    // Note: clearCache() already handles:
    // - Deleting entire database
    // - Preserving essential localStorage settings
    // - Setting minimal required state
    // - Full page reload
  };

  const notifyCacheError = (err: unknown) => {
    console.error("Failed to clear cache:", err);
    alert(
      "Failed to clear cache: " +
        (err instanceof Error ? err.message : String(err)),
    );
  };

  const handleClearCache = async () => {
    try {
      setIsLoading(true);
      await performCacheReset();
    } catch (err) {
      notifyCacheError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTutorialRestart = async () => {
    if (isStartingTutorial) return;
    setIsStartingTutorial(true);
    try {
      resetOnboardingProgress();
      requestTutorialStart();
      setIsTutorialDialogOpen(false);
      setShouldOpenSettingsModal(false);
      await performCacheReset();
    } catch (err) {
      notifyCacheError(err);
      setIsStartingTutorial(false);
    }
  };

  const handleSizeChange = (newSize: number) => {
    setSize(newSize);
    clearThumbnailCache();
    onCloseAllPlaylists();
    setIsOpen(false);
    window.location.reload();
  };

  const handleExportLogs = async () => {
    try {
      setIsLoading(true);
      await exportLogs();
    } catch (err) {
      console.error("Failed to export logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerboseLoggingToggle = (checked: boolean) => {
    setSettings({ ...settings, verboseLogging: checked });
  };

  const openModeDialog = (mode: AppMode) => {
    setPendingMode(mode);
    setIsModeDialogOpen(true);
  };

  const closeModeDialog = () => {
    if (isSwitchingMode) {
      return;
    }
    setPendingMode(null);
    setIsModeDialogOpen(false);
  };

  const confirmModeSwitch = async () => {
    if (!pendingMode) {
      return;
    }

    setIsSwitchingMode(true);
    setError(null);

    try {
      await switchAppMode(pendingMode, {
        onBeforeReset: onCloseAllPlaylists,
      });
      if (pendingMode === "demo") {
        emitOnboardingEvent("demoModeEnabled");
      }
    } catch (err) {
      console.error("Failed to switch application mode:", err);
      setError("Failed to switch application mode. Please try again.");
    } finally {
      setIsSwitchingMode(false);
      setPendingMode(null);
      setIsModeDialogOpen(false);
    }
  };

  const demoButtonLabel = isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode";

  const demoButtonDescription = isDemoMode
    ? "Exit Demo Mode and return to live mode."
    : "Run AstraNotes offline using mock Big Buck Bunny™ data. Switching modes will clear cached data and restart the app.";

  const defaultLabelValue = (() => {
    const firstLabelId = labels[0]?.id ?? "";
    if (isDemoMode) {
      const currentIsValid =
        settings.defaultLabelId &&
        labels.some((label) => label.id === settings.defaultLabelId);
      return currentIsValid ? settings.defaultLabelId! : firstLabelId;
    }
    return settings.defaultLabelId || firstLabelId;
  })();

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-onboarding-target="settings-button"
          onClick={() => handleDialogOpenChange(true)}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your ftrack connection and application preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 md:gap-7">
          
          {/* Left Column */}
          <div className="space-y-4">
            <div className="border p-4 rounded-md bg-muted/30">
              <h1 className="text-3xl font-semibold mb-2 text-center">
                AstraNotes
              </h1>
              <p className="text-sm text-muted-foreground text-center mb-2">
                Version: {appVersion}
              </p>
              <p className="text-sm text-muted-foreground text-center">
                by{" "}
                <a
                  href="https://astralumen.co/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  Astra Lumen Images
                </a>
              </p>
            </div>
            <div
              className="space-y-4"
              data-onboarding-target="settings-overview"
            >
              <div className="space-y-2">
                <Label htmlFor="serverUrl">ftrack URL</Label>
                <Input
                  id="serverUrl"
                  value={settings.serverUrl}
                  onChange={handleInputChange("serverUrl")}
                  placeholder="e.g. https://yourserver.ftrackapp.com"
                  disabled={isDemoMode || isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={settings.apiKey}
                  onChange={handleInputChange("apiKey")}
                  placeholder="Your ftrack API key"
                  disabled={isDemoMode || isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiUser">API User</Label>
                <Input
                  id="apiUser"
                  value={settings.apiUser}
                  onChange={handleInputChange("apiUser")}
                  placeholder="Your ftrack account email"
                  disabled={isDemoMode || isLoading}
                />
              </div>

              <div className="flex items-center space-x-2 text-sm">
                <div className="font-medium">Connection Status:</div>
                <div className="flex items-center space-x-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isDemoMode
                        ? "bg-green-500"
                        : isConnected
                          ? "bg-green-500"
                          : isTesting
                            ? "bg-yellow-500"
                            : "bg-red-500"
                    }`}
                  />
                  <span className="capitalize">
                    {isDemoMode
                      ? "Demo"
                      : isConnected
                        ? "Connected"
                        : isTesting
                          ? "Testing"
                          : "Disconnected"}
                  </span>
                </div>
              </div>

              {error && <div className="text-red-500 text-sm">{error}</div>}

              <div className="flex justify-end space-x-2 pb-2 pt-1">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || isLoading || isDemoMode}
                >
                  {isTesting ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isTesting || isLoading || isDemoMode}
                >
                  Save Credentials
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Onboarding</h4>
                    <p className="text-sm text-muted-foreground max-w-56">
                      Select the onboarding experience you want to have
                    </p>
                  </div>
                  <Label htmlFor="default-label">Default Note Label</Label>
                  <Select
                    value={defaultLabelValue}
                    onValueChange={(value) =>
                      setSettings({ ...settings, defaultLabelId: value })
                    }
                  >
                    <SelectTrigger id="default-label" className="w-[180px]">
                      <SelectValue placeholder="Select a default label" />
                    </SelectTrigger>
                    <SelectContent>
                      {labels.map((label) => (
                        <SelectItem key={label.id} value={label.id}>
                          {label.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Thumbnail Quality</Label>
                  <Select
                    onValueChange={(value) => handleSizeChange(Number(value))}
                    value={size.toString()}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="128">Low (Default)</SelectItem>
                      <SelectItem value="256">Medium</SelectItem>
                      <SelectItem value="512">High</SelectItem>
                      <SelectItem value="1024">Max</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div className="">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium">Updates</h4>
                  <p className="text-sm text-muted-foreground max-w-56">
                    {updateAvailable
                      ? `Version ${updateVersion} available`
                      : "Check for new versions"}
                  </p>
                </div>
                <div className="relative inline-block">
                  {updateAvailable && (
                    <GlowEffect
                      colors={["#FF5733", "#33FF57", "#3357FF", "#F1C40F"]}
                      mode="pulse"
                      blur="soft"
                      duration={3}
                      scale={1.1}
                    />
                  )}
                  <Button
                    variant="default"
                    size="default"
                    onClick={async () => {
                      if (updateAvailable) {
                        if (isUpdating) return;
                        setIsUpdating(true);
                        // Reset update state before installing the update
                        useUpdateStore.getState().resetUpdateState();
                        try {
                          await installUpdate();
                        } catch (err) {
                          console.error("Failed to install update:", err);
                        } finally {
                          setIsUpdating(false);
                        }
                      } else {
                        if (isUpdating) return;
                        setIsUpdating(true);
                        try {
                          await silentCheckForUpdates(true);
                        } catch (err) {
                          console.error("Failed to check for updates:", err);
                        } finally {
                          setIsUpdating(false);
                        }
                      }
                    }}
                    disabled={isLoading || isUpdating}
                    className="relative z-10"
                  >
                    {isUpdating ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        {updateAvailable ? "Installing..." : "Checking..."}
                      </span>
                    ) : updateAvailable ? (
                      "Update Now"
                    ) : (
                      "Check for Updates"
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium">Export Logs</h4>
                  <p className="text-sm text-muted-foreground max-w-56">
                    Export logs from the last 24 hours
                  </p>
                </div>
                <Button
                  variant="default"
                  size="default"
                  onClick={handleExportLogs}
                  disabled={isLoading}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export Logs
                </Button>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-medium">Verbose Debug Logging</h4>
                  <p className="text-sm text-muted-foreground max-w-90">
                    Enable additional debug output for troubleshooting. May
                    impact performance while active.
                  </p>
                </div>
                <Switch
                  id="verbose-logging"
                  checked={settings.verboseLogging}
                  onCheckedChange={handleVerboseLoggingToggle}
                  disabled={isLoading}
                  className="self-center"
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Clear Cache & DB</h3>
                  <p className="text-sm text-zinc-500 max-w-60">
                    Clear all cached playlists, versions, statuses and notes
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="default"
                  onClick={handleClearCache}
                  disabled={isLoading}
                >
                  {isLoading ? "Clearing..." : "Clear Cache & DB"}
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 mt-4 space-y-3">
              <div>
                <h3 className="font-medium">Demo Mode</h3>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground flex-1">
                  {demoButtonDescription}
                </p>
                <Button
                  variant="default"
                  size="default"
                  onClick={() => openModeDialog(isDemoMode ? "real" : "demo")}
                  disabled={isSwitchingMode}
                  data-onboarding-target="demo-mode-toggle"
                >
                  {isSwitchingMode ? "Switching..." : demoButtonLabel}
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium">Guided Tutorial</h3>
                  <p className="text-sm text-muted-foreground">
                    Restart the onboarding walkthrough. This will wipe local
                    data and restart the app.
                  </p>
                </div>
                <Button
                  variant="default"
                  size="default"
                  onClick={() => setIsTutorialDialogOpen(true)}
                  disabled={isLoading || isStartingTutorial}
                  data-onboarding-target="tutorial-restart"
                >
                  {isStartingTutorial ? "Preparing..." : "Restart Tutorial"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={isModeDialogOpen} onOpenChange={(open) => (!open ? closeModeDialog() : openModeDialog(pendingMode ?? (isDemoMode ? "real" : "demo")))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMode === "demo"
                ? "Enable Demo Mode?"
                : "Disable Demo Mode?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>
                {pendingMode === "demo"
                  ? "Demo Mode runs AstraNotes offline with temporary mock data, clears cached playlists, and restarts the app."
                  : "Disabling Demo Mode clears temporary demo data, restores the live ftrack workflow, and restarts the app."}
              </p>
              {pendingMode === "demo" && (
                <p>
                  Optional demo MOV files can be downloaded from{" "}
                  <a
                    href="https://drive.google.com/file/d/1oAtv3SXF21z1TcA_27aCD6KNZEbGxd9_/view?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-blue-500 hover:text-blue-600"
                  >
                    here
                  </a>
                  {" "}and stored in your download folder, e.g.
                  <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    ~/Downloads/AstraNotes_MockData
                  </code>
                  . If they are missing, AstraNotes will fall back to thumbnails only.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeModeDialog} disabled={isSwitchingMode}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch} disabled={isSwitchingMode}>
              {isSwitchingMode
                ? "Switching..."
                : pendingMode === "demo"
                  ? "Enable Demo Mode"
                  : "Disable Demo Mode"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isTutorialDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsTutorialDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Guided Tutorial?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>
                We&apos;ll clear cached playlists, versions, notes, and restart
                AstraNotes to launch the onboarding tutorial from the
                beginning.
              </p>
              <p className="font-medium">
                This will remove any unsaved local changes. Your ftrack data is
                unaffected.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setIsTutorialDialogOpen(false)}
              disabled={isStartingTutorial}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTutorialRestart}
              disabled={isStartingTutorial}
            >
              {isStartingTutorial ? "Restarting..." : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
