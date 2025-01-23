import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { FtrackSettings } from '../types';
import { ftrackService } from '../services/ftrack';

interface SettingsModalProps {
  onLoadPlaylists: () => void;
}

interface Settings extends FtrackSettings {
  autoRefreshEnabled: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onLoadPlaylists }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    serverUrl: '',
    apiKey: '',
    apiUser: '',
    autoRefreshEnabled: true,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('ftrackSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings({
        ...parsed,
        autoRefreshEnabled: parsed.autoRefreshEnabled ?? true,
      });
    }
  }, []);

  const handleSave = async () => {
    localStorage.setItem('ftrackSettings', JSON.stringify(settings));
    ftrackService.updateSettings(settings);
    setIsOpen(false);
    onLoadPlaylists();
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setError(null);

    console.log('Testing connection with settings:', {
      ...settings,
      apiKey: settings.apiKey ? '***' : undefined
    });

    if (!settings.serverUrl || !settings.apiKey || !settings.apiUser) {
      setError('Please fill in all fields');
      setIsTesting(false);
      setIsConnected(false);
      return;
    }

    try {
      // Update service settings before testing
      ftrackService.updateSettings(settings);
      const success = await ftrackService.testConnection();
      setIsConnected(success);
      if (!success) {
        setError('Failed to connect. Please check your credentials.');
      }
    } catch (err) {
      console.error('Connection error:', err);
      setError('An error occurred while testing the connection');
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleInputChange = (field: keyof FtrackSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [field]: e.target.value }));
    // Reset connection status when settings change
    setIsConnected(false);
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[475px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">AstraNote v1.0.0</CardTitle>
            <CardDescription>
              Configure your ftrack connection settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">Server URL</Label>
              <Input
                id="serverUrl"
                value={settings.serverUrl}
                onChange={handleInputChange('serverUrl')}
                placeholder="https://your-instance.ftrack.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={settings.apiKey}
                onChange={handleInputChange('apiKey')}
                placeholder="Your ftrack API key"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiUser">API User</Label>
              <Input
                id="apiUser"
                value={settings.apiUser}
                onChange={handleInputChange('apiUser')}
                placeholder="Your ftrack username"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoRefresh"
                checked={settings.autoRefreshEnabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...settings, autoRefreshEnabled: checked as boolean })
                }
              />
              <Label htmlFor="autoRefresh">
                Auto-refresh playlists (checks for changes every 5 seconds)
              </Label>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <div className="font-medium">Connection Status:</div>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 
                  isTesting ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="capitalize">{isConnected ? 'Connected' : isTesting ? 'Testing' : 'Disconnected'}</span>
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting || isLoading}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button onClick={handleSave} disabled={isTesting || isLoading}>
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};
