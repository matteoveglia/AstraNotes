import { useState, useEffect } from "react";
import { create } from "zustand";
import { ftrackService } from "../services/ftrack";

interface ConnectionState {
  isConnected: boolean;
  lastTested: number;
  setConnected: (connected: boolean) => void;
  setLastTested: (time: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  lastTested: 0,
  setConnected: (connected) => set({ isConnected: connected }),
  setLastTested: (time) => set({ lastTested: time }),
}));

export const useConnectionStatus = () => {
  const { isConnected, lastTested, setConnected, setLastTested } =
    useConnectionStore();

  useEffect(() => {
    // Only auto-test if we haven't tested in the last 5 minutes
    if (Date.now() - lastTested > 5 * 60 * 1000) {
      setLastTested(Date.now());
      testConnection();
    }

    // Check connection every 30 seconds
    const interval = setInterval(() => {
      testConnection();
    }, 30000);

    return () => clearInterval(interval);
  }, [lastTested]);

  const testConnection = async () => {
    try {
      const result = await ftrackService.testConnection();
      setConnected(result);
    } catch (error) {
      setConnected(false);
    }
  };

  return {
    isConnected,
    testConnection,
    lastTested,
  };
};
