import { useEffect } from "react";
import { useLabelStore } from "@/store/labelStore";
import { useProjectStore } from "@/store/projectStore";

/**
 * Handles one-time application startup tasks such as
 * loading the project list and label definitions.
 */
export function useAppInitializer(): void {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);

  useEffect(() => {
    Promise.all([loadProjects(), fetchLabels()]).catch((error) => {
      console.error("Failed to initialize app:", error);
    });
  }, [loadProjects, fetchLabels]);
} 