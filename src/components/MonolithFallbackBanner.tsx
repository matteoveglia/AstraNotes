import React from "react";
import { useSettings } from "@/store/settingsStore";

export const MonolithFallbackBanner: React.FC = () => {
  const useFallback = useSettings((s) => s.settings.useMonolithFallback);

  if (!useFallback) return null;

  return (
    <div className="w-full bg-red-600 text-white text-center py-1 text-sm z-50">
      ⚠️  Ftrack monolith fallback is ACTIVE. Please complete Phase 3.5 migration.
    </div>
  );
}; 