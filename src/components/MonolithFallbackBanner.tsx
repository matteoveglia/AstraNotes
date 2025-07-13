import React from "react";
import { useSettings } from "@/store/settingsStore";

export const MonolithFallbackBanner: React.FC = () => {
  const useFallback = useSettings((s) => s.settings.useMonolithFallback);

  if (!useFallback) return null;

  return (
    <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-1 text-sm z-50 pointer-events-none">
      ⚠️ Ftrack monolith fallback is ACTIVE. Please complete Phase 3.5
      migration.
    </div>
  );
};
