/**
 * @fileoverview useConnectionStatus.ts
 * Custom hook managing FTrack connection status.
 * Implements connection polling and caching using Zustand store.
 * Features auto-reconnection, status persistence, and periodic testing.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { ftrackAuthService } from "../services/ftrack/FtrackAuthService";

interface ConnectionState {
  isConnected: boolean;
  lastTested: number;
  connecting: boolean;
  justPolled: boolean;
  setConnected: (connected: boolean) => void;
  setLastTested: (time: number) => void;
  setConnecting: (val: boolean) => void;
  setJustPolled: (val: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  lastTested: 0,
  connecting: false,
  justPolled: false,
  setConnected: (connected) => set({ isConnected: connected }),
  setLastTested: (time) => set({ lastTested: time }),
  setConnecting: (val) => set({ connecting: val }),
  setJustPolled: (val) => set({ justPolled: val }),
}));

export const useConnectionStatus = () => {
  const {
    isConnected,
    lastTested,
    connecting,
    justPolled,
    setConnected,
    setLastTested,
    setConnecting,
    setJustPolled,
  } = useConnectionStore();

  useEffect(() => {
    // Only auto-test if we haven't tested in the last 5 minutes
    if (Date.now() - lastTested > 5 * 60 * 1000) {
      setLastTested(Date.now());
      // Treat the first attempt as a manual-style test to show connecting pulse
      testConnection();
    }

    // Check connection every 30 seconds
    const interval = setInterval(() => {
      pollConnection();
    }, 30000);

    return () => clearInterval(interval);
  }, [lastTested]);

  // Manual test used for: initial app load and user-triggered tests/saves
  const testConnection = async (): Promise<boolean> => {
    setConnecting(true);
    try {
      const result = await ftrackAuthService.testConnection();
      setConnected(result);
      return result;
    } catch (error) {
      setConnected(false);
      return false;
    } finally {
      setConnecting(false);
    }
  };

  // Background poll every 30s. On success, trigger a brief pulse.
  const pollConnection = async (): Promise<boolean> => {
    try {
      const result = await ftrackAuthService.testConnection();
      setConnected(result);
      if (result) {
        setJustPolled(true);
        // Clear the flag shortly after to enable one-time pulse animations
        setTimeout(() => setJustPolled(false), 700);
      }
      return result;
    } catch (error) {
      setConnected(false);
      return false;
    }
  };

  return {
    isConnected,
    connecting,
    justPolled,
    testConnection,
    pollConnection,
    lastTested,
  };
};
