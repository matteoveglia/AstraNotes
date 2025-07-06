import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSettings } from "@/store/settingsStore";

// Dynamically import after toggling flag to ensure correct branch executed
async function getAuthService() {
  const mod = await import("@/services/ftrack/FtrackAuthService");
  return mod.ftrackAuthService;
}

describe("FtrackAuthService flag switching", () => {
  beforeEach(() => {
    // reset flag before each test
    const current = useSettings.getState().settings;
    useSettings.getState().setSettings({ ...current, useMonolithFallback: true });
  });

  it("delegates to monolith when fallback true", async () => {
    // Mock legacy service dynamically
    vi.mock("@/services/legacy/ftrack", () => ({
      ftrackService: {
        testConnection: vi.fn().mockResolvedValue(true),
      },
    }));

    const auth = await getAuthService();
    const result = await auth.testConnection();
    expect(result).toBe(true);
  });

  it("uses Base client when fallback false", async () => {
    const current = useSettings.getState().settings;
    useSettings.getState().setSettings({ ...current, useMonolithFallback: false });

    // Spy on Base client method
    const { baseFtrackClient } = await import("@/services/ftrack/BaseFtrackClient");
    vi.spyOn(baseFtrackClient, "testConnection").mockResolvedValueOnce(false);

    const auth = await getAuthService();
    const result = await auth.testConnection();
    expect(result).toBe(false);
  });
}); 