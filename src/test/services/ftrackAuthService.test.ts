import { describe, it, expect, vi, beforeEach } from "vitest";
import { ftrackAuthService } from "@/services/ftrack/FtrackAuthService";
import { BaseFtrackClient } from "@/services/ftrack/BaseFtrackClient";

describe("FtrackAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use BaseFtrackClient for testConnection", async () => {
    // Mock the parent class method
    vi.spyOn(
      BaseFtrackClient.prototype,
      "testConnection",
    ).mockResolvedValueOnce(true);

    const result = await ftrackAuthService.testConnection();
    expect(result).toBe(true);
    expect(BaseFtrackClient.prototype.testConnection).toHaveBeenCalledOnce();
  });

  it("should use BaseFtrackClient for getSession", async () => {
    const mockSession = { id: "session-123" };
    vi.spyOn(BaseFtrackClient.prototype, "getSession").mockResolvedValueOnce(
      mockSession as any,
    );

    const result = await ftrackAuthService.getSession();
    expect(result).toBe(mockSession);
    expect(BaseFtrackClient.prototype.getSession).toHaveBeenCalledOnce();
  });

  it("should use BaseFtrackClient for updateSettings", async () => {
    const mockSettings = { serverUrl: "test", apiKey: "key", apiUser: "user" };
    vi.spyOn(
      BaseFtrackClient.prototype,
      "updateSettings",
    ).mockImplementationOnce(() => {});

    await ftrackAuthService.updateSettings(mockSettings);
    expect(BaseFtrackClient.prototype.updateSettings).toHaveBeenCalledWith(
      mockSettings,
    );
  });
});
