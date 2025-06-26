/**
 * @fileoverview VersionDetailsPanel.tsx
 * Panel component displaying detailed version information including asset name,
 * version number, description, asset type, upload details, and publishing info.
 * @component
 */

import React, { useState, useEffect, useRef } from "react";
import { ftrackService } from "@/services/ftrack";
import { useToast } from "@/components/ui/toast";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { motion } from "motion/react";

interface VersionDetails {
  id: string;
  assetName: string;
  versionNumber: number;
  description?: string;
  assetType?: string;
  publishedBy?: string;
  publishedAt?: string;
}

interface VersionDetailsPanelProps {
  assetVersionId: string;
  onClose?: () => void;
  className?: string;
}

// Simple cache for version details
const versionDetailsCache: {
  [key: string]: {
    timestamp: number;
    details: VersionDetails;
  };
} = {};
const CACHE_TTL = 60 * 1000; // 1 minute

export function VersionDetailsPanel({
  assetVersionId,
  onClose,
  className,
}: VersionDetailsPanelProps) {
  const [versionDetails, setVersionDetails] = useState<VersionDetails | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [shouldOpenUpward, setShouldOpenUpward] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { showError } = useToast();

  // Check if panel should open upward to avoid overflow
  useEffect(() => {
    const checkPosition = () => {
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const panelHeight = 320; // Approximate panel height

        setShouldOpenUpward(spaceBelow < panelHeight && rect.top > panelHeight);
      }
    };

    checkPosition();
    window.addEventListener("resize", checkPosition);
    return () => window.removeEventListener("resize", checkPosition);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchVersionDetails = async () => {
      if (!assetVersionId) return;

      setIsLoading(true);
      try {
        // Check cache first
        const cached = versionDetailsCache[assetVersionId];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setVersionDetails(cached.details);
          setIsLoading(false);
          console.debug("[VersionDetailsPanel] Using cached version details");
          return;
        }

        // Fetch from ftrack
        const details = await ftrackService.fetchVersionDetails(assetVersionId);

        if (!cancelled) {
          setVersionDetails(details);
          // Cache the result
          versionDetailsCache[assetVersionId] = {
            timestamp: Date.now(),
            details,
          };
          console.debug("[VersionDetailsPanel] Cached version details");
        }
      } catch (error) {
        console.error("Error fetching version details:", error);
        if (!cancelled) {
          showError("Failed to fetch version details");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchVersionDetails();

    return () => {
      cancelled = true;
    };
  }, [assetVersionId, showError]);

  return (
    <div ref={panelRef}>
      <DismissableLayer
        disableOutsidePointerEvents={false}
        onEscapeKeyDown={() => {
          if (onClose) onClose();
        }}
        onPointerDownOutside={(event) => {
          if (onClose) onClose();
        }}
        onFocusOutside={(event) => {
          if (onClose) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "absolute right-0 z-50 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4",
            shouldOpenUpward ? "bottom-full mb-2" : "top-full mt-2",
            className,
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Version Details
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : versionDetails ? (
            <div className="space-y-1">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Asset Name
                </label>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                  {versionDetails.assetName}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Version Number
                </label>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                  v{versionDetails.versionNumber}
                </p>
              </div>

              {versionDetails.assetType && (
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Asset Type
                  </label>
                  <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                    {versionDetails.assetType}
                  </p>
                </div>
              )}

              {versionDetails.publishedBy && (
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Published By
                  </label>
                  <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                    {versionDetails.publishedBy}
                  </p>
                </div>
              )}

              {versionDetails.publishedAt && (
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Published At
                  </label>
                  <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                    {new Date(versionDetails.publishedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {versionDetails.description && (
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Description
                  </label>
                  <div className="mt-1 max-h-24 overflow-y-auto">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
                      {versionDetails.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No version details available
              </p>
            </div>
          )}
        </motion.div>
      </DismissableLayer>
    </div>
  );
}
