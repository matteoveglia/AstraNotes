/**
 * @fileoverview VersionSearch.tsx
 * Search component for version discovery and addition.
 * Features debounced search, thumbnails, version selection,
 * clear functionality, loading states, and Quick Notes features.
 * @component
 */

import React, { useState, useCallback, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useDebounce } from "../hooks/useDebounce";
import { AssetVersion } from "../types";
import { ftrackService } from "../services/ftrack";
import { motion } from 'motion/react';

interface VersionSearchProps {
  onVersionSelect: (version: AssetVersion) => void;
  onClearAdded: () => void;
  hasManuallyAddedVersions?: boolean;
  isQuickNotes?: boolean;
}

export const VersionSearch: React.FC<VersionSearchProps> = ({
  onVersionSelect,
  onClearAdded,
  hasManuallyAddedVersions = false,
  isQuickNotes = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<AssetVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const handleSearch = useCallback(async () => {
    if (!debouncedSearchTerm) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const versions = await ftrackService.searchVersions({
        searchTerm: debouncedSearchTerm,
      });
      setResults(versions);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchTerm]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handleClearVersions = () => {
    onClearAdded();
  };

  const gridVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { 
      opacity: 0, 
      scale: 0.8,
      transition: { duration: 0.2 }
    },
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10,
      duration: 0.6
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 60, damping: 10, duration: 1 }}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by asset name or version (e.g. 'shot_010' or 'v2')"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearVersions}
              disabled={!hasManuallyAddedVersions}
            >
              Clear Added Versions
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-[300px] text-center py-2 text-lg text-gray-500">Loading...</div>
        ) : results.length > 0 ? (
          <motion.div
            className="grid grid-cols-4 xl:grid-cols-5 gap-1.5 max-h-[300px] overflow-y-auto"
            variants={gridVariants} // Apply motion variants to the grid
            initial="hidden"
            animate="visible"
          >
            {results.map((version) => (
              <motion.div
                key={version.id}
                className="border rounded p-1.5 cursor-pointer hover:bg-gray-100 text-xs"
                variants={itemVariants} // Apply motion variants to each item
                onClick={() => {
                  if (onVersionSelect) {
                    onVersionSelect(version);
                    setSearchTerm("");
                    setResults([]);
                  }
                }}
              >
                {version.thumbnailUrl && (
                  <img
                    src={version.thumbnailUrl}
                    alt={version.name}
                    className="w-full h-16 object-cover mb-1"
                  />
                )}
                <div className="font-medium truncate">{version.name}</div>
                <div className="text-gray-500">v{version.version}</div>
              </motion.div>
            ))}
          </motion.div>
        ) : debouncedSearchTerm ? (
          <div className="text-center py-2 text-sm text-gray-500">
            No results found
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};
