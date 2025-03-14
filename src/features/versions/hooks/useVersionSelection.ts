/**
 * @fileoverview useVersionSelection.ts
 * Custom hook for managing version selection state and operations.
 * Handles selecting, deselecting, and toggling versions.
 */

import { useState, useCallback } from 'react';

export function useVersionSelection() {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  const toggleVersionSelection = useCallback((versionId: string) => {
    setSelectedVersions((prev) =>
      prev.includes(versionId)
        ? prev.filter((id) => id !== versionId)
        : [...prev, versionId]
    );
  }, []);

  const selectVersion = useCallback((versionId: string) => {
    setSelectedVersions((prev) => {
      if (prev.includes(versionId)) return prev;
      return [...prev, versionId];
    });
  }, []);

  const deselectVersion = useCallback((versionId: string) => {
    setSelectedVersions((prev) => prev.filter((id) => id !== versionId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedVersions([]);
  }, []);

  const isSelected = useCallback(
    (versionId: string) => selectedVersions.includes(versionId),
    [selectedVersions]
  );

  return {
    selectedVersions,
    toggleVersionSelection,
    selectVersion,
    deselectVersion,
    clearSelection,
    isSelected,
  };
}
