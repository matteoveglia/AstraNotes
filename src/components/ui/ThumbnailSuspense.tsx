/**
 * @fileoverview ThumbnailSuspense.tsx
 * Suspense-based thumbnail component that automatically handles loading states.
 * Provides better user experience with automatic loading coordination.
 */

import React, { Suspense } from "react";
import { cn } from "@/lib/utils";
import { getThumbnailSuspense } from "@/services/thumbnailService";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";

interface ThumbnailImageProps {
  thumbnailId: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Internal component that uses Suspense-compatible thumbnail fetching
 */
function ThumbnailImage({
  thumbnailId,
  alt,
  className,
  onClick,
}: ThumbnailImageProps) {
  // This will throw a promise if the thumbnail is loading (Suspense will catch it)
  // Note: We need to handle the session asynchronously within the getThumbnailSuspense
  const thumbnailUrl = getThumbnailSuspense(thumbnailId);

  if (!thumbnailUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground text-xs",
          className,
        )}
        onClick={onClick}
      >
        No Image
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={alt}
      className={cn("object-cover", className)}
      onClick={onClick}
      loading="lazy"
    />
  );
}

/**
 * Thumbnail skeleton component for loading states
 */
function ThumbnailSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground",
        className,
      )}
    >
      Loading...
    </div>
  );
}

interface ThumbnailSuspenseProps {
  thumbnailId?: string | null;
  alt: string;
  className?: string;
  onClick?: () => void;
  fallback?: React.ReactNode;
}

/**
 * Suspense-wrapped thumbnail component with automatic loading states
 */
export const ThumbnailSuspense: React.FC<ThumbnailSuspenseProps> = ({
  thumbnailId,
  alt,
  className,
  onClick,
  fallback,
}) => {
  // Show fallback if no thumbnail ID
  if (!thumbnailId) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground text-xs",
          className,
        )}
        onClick={onClick}
      >
        No Image
      </div>
    );
  }

  return (
    <Suspense
      fallback={fallback || <ThumbnailSkeleton className={className} />}
    >
      <ThumbnailImage
        thumbnailId={thumbnailId}
        alt={alt}
        className={className}
        onClick={onClick}
      />
    </Suspense>
  );
};
