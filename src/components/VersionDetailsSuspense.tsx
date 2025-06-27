/**
 * @fileoverview VersionDetailsSuspense.tsx
 * Suspense-wrapped version details component that automatically handles loading states.
 * Eliminates manual loading state management and provides smooth loading experience.
 */

import React, { Suspense } from "react";
import { motion } from "motion/react";
import { fetchVersionDetailsSuspense } from "@/services/versionDetailsService";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VersionDetails {
  id: string;
  assetName: string;
  versionNumber: number;
  description?: string;
  assetType?: string;
  publishedBy?: string;
  publishedAt?: string;
}

interface VersionDetailsContentProps {
  assetVersionId: string;
  shouldOpenUpward: boolean;
  onClose?: () => void;
  className?: string;
}

/**
 * Internal component that uses Suspense-compatible fetch
 */
function VersionDetailsContent({
  assetVersionId,
  shouldOpenUpward,
  onClose,
  className,
}: VersionDetailsContentProps) {
  // This will throw a promise if fetch is loading (Suspense will catch it)
  const versionDetails = fetchVersionDetailsSuspense(assetVersionId);

  return (
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
    </motion.div>
  );
}

/**
 * Loading skeleton for version details
 */
function VersionDetailsLoading({
  shouldOpenUpward,
  onClose,
  className,
}: {
  shouldOpenUpward: boolean;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
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

      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    </motion.div>
  );
}

/**
 * Suspense-wrapped version details component
 */
export const VersionDetailsSuspense: React.FC<VersionDetailsContentProps> = (props) => {
  // Don't render anything if no asset version ID
  if (!props.assetVersionId) {
    return null;
  }

  return (
    <Suspense 
      fallback={
        <VersionDetailsLoading 
          shouldOpenUpward={props.shouldOpenUpward}
          onClose={props.onClose}
          className={props.className}
        />
      }
    >
      <VersionDetailsContent {...props} />
    </Suspense>
  );
}; 