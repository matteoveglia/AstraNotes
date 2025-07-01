/**
 * @fileoverview VersionDetailsSuspense.tsx
 * Suspense-wrapped version details component that automatically handles loading states.
 * Eliminates manual loading state management and provides smooth loading experience.
 */

import React, { Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { fetchVersionDetailsSuspense } from "@/services/versionDetailsService";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
}: {
  assetVersionId: string;
}) {
  // This will throw a promise if fetch is loading (Suspense will catch it)
  const versionDetails = fetchVersionDetailsSuspense(assetVersionId);

  return (
    <motion.div
      key="content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Asset Name - always present */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Asset Name
        </label>
        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1 select-text break-words">
          {versionDetails.assetName}
        </p>
      </div>

      {/* Version Number - always present */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Version Number
        </label>
        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1 select-text break-words">
          v{versionDetails.versionNumber}
        </p>
      </div>

      {/* Asset Type - always show field, use placeholder if missing */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Asset Type
        </label>
        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1 select-text break-words">
          {versionDetails.assetType || "—"}
        </p>
      </div>

      {/* Published By - always show field, use placeholder if missing */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Published By
        </label>
        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1 select-text break-words">
          {versionDetails.publishedBy || "—"}
        </p>
      </div>

      {/* Published At - always show field, use placeholder if missing */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Published At
        </label>
        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1 select-text break-words">
          {versionDetails.publishedAt 
            ? new Date(versionDetails.publishedAt).toLocaleString()
            : "—"
          }
        </p>
      </div>

      {/* Description - always show field, use placeholder if missing */}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Description
        </label>
        <div className="mt-1 max-h-24 overflow-y-auto">
          <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap select-text break-words">
            {versionDetails.description || "—"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Loading skeleton for version details that matches the content structure
 */
function VersionDetailsLoading() {
  return (
    <motion.div
      key="skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Asset Name skeleton */}
      <div>
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-4 w-full" />
      </div>

      {/* Version Number skeleton */}
      <div>
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-4 w-12" />
      </div>

      {/* Asset Type skeleton */}
      <div>
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Published By skeleton */}
      <div>
        <Skeleton className="h-3 w-18 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Published At skeleton */}
      <div>
        <Skeleton className="h-3 w-18 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Description skeleton */}
      <div>
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-4 w-8" />
      </div>
    </motion.div>
  );
}

/**
 * Suspense-wrapped version details component
 */
export const VersionDetailsSuspense: React.FC<VersionDetailsContentProps> = ({
  assetVersionId,
  shouldOpenUpward,
  onClose,
  className,
}) => {
  // Don't render anything if no asset version ID
  if (!assetVersionId) {
    return null;
  }

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

      <AnimatePresence mode="wait">
        <Suspense fallback={<VersionDetailsLoading />}>
          <VersionDetailsContent assetVersionId={assetVersionId} />
        </Suspense>
      </AnimatePresence>
    </motion.div>
  );
};
