import { useEffect } from "react";
import { useLabelStore } from "@/store/labelStore";
import { useProjectStore } from "@/store/projectStore";
import { statusClient } from "@/services/client";

/**
 * Handles one-time application startup tasks such as
 * loading the project list and label definitions.
 */
export function useAppInitializer(): void {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);

  useEffect(() => {
    Promise.all([
      loadProjects(),
      fetchLabels(),
      statusClient().ensureStatusMappingsInitialized().catch((error) => {
        console.error("Failed to initialize status mappings:", error);
      }),
    ]).catch((error) => {
      console.error("Failed to initialize app:", error);
    });
  }, [loadProjects, fetchLabels]);
}
