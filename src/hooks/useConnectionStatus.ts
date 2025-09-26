/**
 * @fileoverview useConnectionStatus.ts
 * Custom hook managing FTrack connection status.
 * Implements connection polling and caching using Zustand store.
 * Features auto-reconnection, status persistence, and periodic testing.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { ftrackAuthService } from "../services/ftrack/FtrackAuthService";
import { useAppModeStore } from "@/store/appModeStore";

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
  const { appMode } = useAppModeStore();

  useEffect(() => {
    if (appMode === "demo") {
      setConnected(true);
      setConnecting(false);
      setJustPolled(false);
      setLastTested(Date.now());
      return () => {};
    }

    if (Date.now() - lastTested > 5 * 60 * 1000) {
      setLastTested(Date.now());
      testConnection();
    }

    const interval = setInterval(() => {
      pollConnection();
    }, 30000);

    return () => clearInterval(interval);
  }, [lastTested, appMode]);

  // Manual test used for: initial app load and user-triggered tests/saves
  const testConnection = async (): Promise<boolean> => {
    if (appMode === "demo") {
      setConnected(true);
      setConnecting(false);
      setJustPolled(false);
      setLastTested(Date.now());
      return true;
    }

    setConnecting(true);
    try {
      const result = await ftrackAuthService.testConnection();
      setConnected(result);
      setLastTested(Date.now());
      if (result) {
        setJustPolled(true);
        setTimeout(() => setJustPolled(false), 700);
      } else {
        setJustPolled(false);
      }
      return result;
    } catch (error) {
      setConnected(false);
      setLastTested(Date.now());
      setJustPolled(false);
      return false;
    } finally {
      setConnecting(false);
    }
  };

  // Background poll every 30s. On success, trigger a brief pulse.
  const pollConnection = async (): Promise<boolean> => {
    if (appMode === "demo") {
      setConnected(true);
      setJustPolled(false);
      setLastTested(Date.now());
      return true;
    }

    try {
      const result = await ftrackAuthService.testConnection();
      setConnected(result);
      setLastTested(Date.now());
      if (result) {
        setJustPolled(true);
        // Clear the flag shortly after to enable one-time pulse animations
        setTimeout(() => setJustPolled(false), 700);
      } else {
        setJustPolled(false);
      }
      return result;
    } catch (error) {
      setConnected(false);
      setLastTested(Date.now());
      setJustPolled(false);
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
