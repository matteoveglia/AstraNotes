import { describe, it, expect, vi, beforeEach } from "vitest";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";
import { baseFtrackClient } from "@/services/ftrack/BaseFtrackClient";

describe("FtrackAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use BaseFtrackClient for testConnection", async () => {
    // Spy on Base client method
    vi.spyOn(baseFtrackClient, "testConnection").mockResolvedValueOnce(true);

    const result = await ftrackAuthService.testConnection();
    expect(result).toBe(true);
    expect(baseFtrackClient.testConnection).toHaveBeenCalledOnce();
  });

  it("should use BaseFtrackClient for getSession", async () => {
    const mockSession = { id: "session-123" };
    vi.spyOn(baseFtrackClient, "getSession").mockResolvedValueOnce(
      mockSession as any,
    );

    const result = await ftrackAuthService.getSession();
    expect(result).toBe(mockSession);
    expect(baseFtrackClient.getSession).toHaveBeenCalledOnce();
  });

  it("should use BaseFtrackClient for updateSettings", async () => {
    const mockSettings = { serverUrl: "test", apiKey: "key", apiUser: "user" };
    vi.spyOn(baseFtrackClient, "updateSettings").mockImplementationOnce(
      () => {},
    );

    ftrackAuthService.updateSettings(mockSettings);
    expect(baseFtrackClient.updateSettings).toHaveBeenCalledWith(mockSettings);
  });
});
