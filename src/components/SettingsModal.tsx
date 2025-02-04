import React, { useState, useEffect } from "react";
import { Settings } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkForUpdates } from "../lib/updater";

interface SettingsModalProps {
  onLoadPlaylists: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onLoadPlaylists,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { settings, setSettings } = useSettings();
  const { labels, fetchLabels } = useLabelStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for updates when the app starts
    checkForUpdates();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLabels();
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
      onLoadPlaylists();
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings");
    } finally {
      setIsLoading(false);
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
      // Clear all tables
      await db.playlists.clear();
      await db.versions.clear();

      // Reset any polling that might be happening
      playlistStore.stopPolling();

      // Reload playlists from FTrack
      onLoadPlaylists();

      // Show success state briefly
      setError("Cache cleared successfully");
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error("Failed to clear cache:", err);
      setError("Failed to clear cache");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serverUrl">Server URL</Label>
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
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Clear Cache</h3>
                <p className="text-sm text-gray-500">
                  Clear all cached playlists, versions and notes
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearCache}
                disabled={isLoading}
              >
                {isLoading ? "Clearing..." : "Clear Cache"}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-medium">Updates</h4>
                <p className="text-sm text-muted-foreground">
                  Check for new versions of AstraNotes
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => checkForUpdates()}
                disabled={isLoading}
              >
                Check for Updates
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
