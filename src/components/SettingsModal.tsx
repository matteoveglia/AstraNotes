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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ftrackService } from "../services/ftrack";
import { db } from "../store/db";
import { playlistStore } from "../store/playlistStore";
import { useSettings } from "../store/settingsStore";
import { useLabelStore } from "../store/labelStore";
import { useThumbnailSettingsStore } from "../store/thumbnailSettingsStore";
import { clearThumbnailCache } from "../services/thumbnailService";
import { usePlaylistsStore } from "../store/playlistsStore";
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

interface SettingsModalProps {
  onLoadPlaylists: () => Promise<void>;
  onCloseAllPlaylists: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onLoadPlaylists,
  onCloseAllPlaylists,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { settings, setSettings } = useSettings();
  const { labels, fetchLabels } = useLabelStore();
  const { size, setSize } = useThumbnailSettingsStore();
  const { setActivePlaylist } = usePlaylistsStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const { updateAvailable, updateVersion } = useUpdateStore();

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
      setIsLoading(true);
      // Update service settings
      ftrackService.updateSettings(settings);

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
    setIsTesting(true);
    setError(null);

    try {
      // Update service settings before testing
      ftrackService.updateSettings(settings);
      const success = await ftrackService.testConnection();
      setIsConnected(success);
      if (!success) {
        setError("Failed to connect. Please check your credentials.");
      }
    } catch (err) {
      console.error("Connection error:", err);
      setError("An error occurred while testing the connection");
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleInputChange =
    (field: keyof typeof settings) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSettings({ ...settings, [field]: e.target.value });
      // Reset connection status when settings change
      setIsConnected(false);
      setError(null);
    };

  const handleClearCache = async () => {
    try {
      setIsLoading(true);

      // Close the modal first
      setIsOpen(false);

      // Clear all tables
      await db.playlists.clear();
      await db.versions.clear();
      await db.attachments.clear();

      // Reset any polling that might be happening
      playlistStore.stopPolling();

      // Clear thumbnail cache
      clearThumbnailCache();

      // Reset UI state
      onCloseAllPlaylists();

      // Set active playlist to Quick Notes
      setActivePlaylist("quick-notes");

      // Reload playlists from FTrack
      await onLoadPlaylists();

      // For a complete reset reload the window
      window.location.reload();
    } catch (err) {
      console.error("Failed to clear cache:", err);
      alert(
        "Failed to clear cache: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsLoading(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 md:gap-7">
          {/* Left Column */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">Ftrack URL</Label>
              <Input
                id="serverUrl"
                value={settings.serverUrl}
                onChange={handleInputChange("serverUrl")}
                placeholder="e.g. https://yourserver.ftrackapp.com"
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiUser">API User</Label>
              <Input
                id="apiUser"
                value={settings.apiUser}
                onChange={handleInputChange("apiUser")}
                placeholder="Your ftrack account email"
              />
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <div className="font-medium">Connection Status:</div>
              <div className="flex items-center space-x-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? "bg-green-500"
                      : isTesting
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                />
                <span className="capitalize">
                  {isConnected
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
                disabled={isTesting || isLoading}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={handleSave} disabled={isTesting || isLoading}>
                Save Credentials
              </Button>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between mt-1">
                  <Label htmlFor="auto-refresh">Enable Auto Refresh</Label>
                  <Switch
                    id="auto-refresh"
                    checked={settings.autoRefreshEnabled}
                    onCheckedChange={(checked: boolean) =>
                      setSettings({
                        ...settings,
                        autoRefreshEnabled: checked,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="default-label">Default Note Label</Label>
                  <Select
                    value={settings.defaultLabelId || labels[0]?.id}
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

            <div className="border-t pt-4 mt-4">
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
                    onClick={() =>
                      updateAvailable
                        ? installUpdate()
                        : silentCheckForUpdates(true)
                    }
                    disabled={isLoading}
                    className="relative z-10"
                  >
                    {updateAvailable ? "Update Now" : "Check for Updates"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
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
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Clear Cache</h3>
                  <p className="text-sm text-gray-500 max-w-56">
                    Clear all cached playlists, versions, statuses and notes
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="default"
                  onClick={handleClearCache}
                  disabled={isLoading}
                >
                  {isLoading ? "Clearing..." : "Clear Cache"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
