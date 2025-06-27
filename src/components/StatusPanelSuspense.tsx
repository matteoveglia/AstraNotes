/**
 * @fileoverview StatusPanelSuspense.tsx
 * Suspense-wrapped status panel component that automatically handles loading states.
 * Eliminates manual loading state management for status operations.
 */

import React, { Suspense, useState } from "react";
import { motion } from "motion/react";
import {
  fetchStatusPanelDataSuspense,
  updateEntityStatusSuspense,
} from "@/services/statusPanelService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Status {
  id: string;
  name: string;
  color?: string;
}

interface StatusPanelContentProps {
  assetVersionId: string;
  shouldOpenUpward: boolean;
  onClose?: () => void;
  className?: string;
}

/**
 * Internal component that uses Suspense-compatible fetch
 */
function StatusPanelContent({
  assetVersionId,
  shouldOpenUpward,
  onClose,
  className,
}: StatusPanelContentProps) {
  // This will throw a promise if fetch is loading (Suspense will catch it)
  const { currentStatuses, versionStatuses, parentStatuses } =
    fetchStatusPanelDataSuspense(assetVersionId);

  const { showSuccess, showError } = useToast();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleStatusChange = async (
    statusId: string,
    type: "version" | "parent",
  ) => {
    setIsUpdating(true);
    try {
      if (type === "version") {
        // Optimistic update happens in the service layer
        await updateEntityStatusSuspense(
          "AssetVersion",
          currentStatuses.versionId,
          statusId,
        );
        showSuccess("Version status updated");
      } else if (
        type === "parent" &&
        currentStatuses.parentId &&
        currentStatuses.parentType
      ) {
        // Optimistic update happens in the service layer
        await updateEntityStatusSuspense(
          currentStatuses.parentType,
          currentStatuses.parentId,
          statusId,
        );
        showSuccess("Shot status updated");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      showError("Failed to update status");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div
      initial={false} // Disable initial animation to prevent re-animation on updates
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      key={`status-panel-${assetVersionId}`} // Stable key tied to asset version
      className={cn(
        "absolute right-0 z-50 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4",
        shouldOpenUpward ? "bottom-full mb-2" : "top-full mt-2",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            Update Status
          </h3>
          {isUpdating && (
            <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Version Status */}
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
            Version Status
          </label>
          <Select
            value={currentStatuses.versionStatusId}
            onValueChange={(value) => handleStatusChange(value, "version")}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {versionStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  <div className="flex items-center gap-2">
                    {status.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                    {status.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parent Status (if available) */}
        {currentStatuses.parentId && parentStatuses.length > 0 && (
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
              Shot Status
            </label>
            <Select
              value={currentStatuses.parentStatusId}
              onValueChange={(value) => handleStatusChange(value, "parent")}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {parentStatuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    <div className="flex items-center gap-2">
                      {status.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                      )}
                      {status.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Loading skeleton for status panel
 */
function StatusPanelLoading({
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
      initial={false} // Disable initial animation for loading state
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1 }}
      key="status-panel-loading"
      className={cn(
        "absolute right-0 z-50 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4",
        shouldOpenUpward ? "bottom-full mb-2" : "top-full mt-2",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          Update Status
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
 * Suspense-wrapped status panel component
 */
export const StatusPanelSuspense: React.FC<StatusPanelContentProps> = (
  props,
) => {
  // Don't render anything if no asset version ID
  if (!props.assetVersionId) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <StatusPanelLoading
          shouldOpenUpward={props.shouldOpenUpward}
          onClose={props.onClose}
          className={props.className}
        />
      }
    >
      <StatusPanelContent {...props} />
    </Suspense>
  );
};
