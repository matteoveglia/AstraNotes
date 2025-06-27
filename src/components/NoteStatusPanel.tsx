import React, { useEffect, useRef, useState } from "react";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { StatusPanelSuspense } from "@/components/StatusPanelSuspense";
import ErrorBoundary from "@/components/ErrorBoundary";

interface NoteStatusPanelProps {
  assetVersionId: string;
  onClose?: () => void;
  className?: string;
}

export function NoteStatusPanel({
  assetVersionId,
  onClose,
  className,
}: NoteStatusPanelProps) {
  const [shouldOpenUpward, setShouldOpenUpward] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Check if panel should open upward to avoid overflow
  useEffect(() => {
    const checkPosition = () => {
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const panelHeight = 200; // Approximate panel height

        setShouldOpenUpward(spaceBelow < panelHeight && rect.top > panelHeight);
      }
    };

    checkPosition();
    window.addEventListener("resize", checkPosition);
    return () => window.removeEventListener("resize", checkPosition);
  }, []);

  // Panel is always open when rendered; closing is handled by parent
  return (
    <div ref={panelRef}>
      <DismissableLayer
        disableOutsidePointerEvents={false}
        onEscapeKeyDown={() => {
          if (onClose) onClose();
        }}
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-select-trigger]") ||
            target.closest("[data-select-content]")
          ) {
            event.preventDefault();
            return;
          }
          if (onClose) onClose();
        }}
        onFocusOutside={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-select-trigger]") ||
            target.closest("[data-select-content]")
          ) {
            event.preventDefault();
            return;
          }
        }}
      >
        <ErrorBoundary
          fallback={(error, resetError) => (
            <div className="absolute right-0 z-50 w-80 bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-700 rounded-lg shadow-lg p-4">
              <h3 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-2">
                Failed to load status panel
              </h3>
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                {error.message}
              </p>
              <button
                onClick={resetError}
                className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded"
              >
                Try again
              </button>
            </div>
          )}
        >
          <StatusPanelSuspense
            assetVersionId={assetVersionId}
            shouldOpenUpward={shouldOpenUpward}
            onClose={onClose}
            className={className}
          />
        </ErrorBoundary>
      </DismissableLayer>
    </div>
  );
}
