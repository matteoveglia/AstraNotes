import { BaseFtrackClient } from "./BaseFtrackClient";
import { useSettings } from "@/store/settingsStore";
import type { FtrackSettings } from "@/types";

export class FtrackAuthService extends BaseFtrackClient {
  private legacyService: any | null = null;

  private async getLegacy() {
    if (!this.legacyService) {
      const mod = await import("../legacy/ftrack");
      this.legacyService = mod.ftrackService;
    }
    return this.legacyService;
  }
  private isFallback() {
    return useSettings.getState().settings.useMonolithFallback;
  }
  /**
   * Updates the stored connection credentials/settings. Delegates to legacy service for now.
   */
  async updateSettings(settings: FtrackSettings) {
    if (this.isFallback()) {
      (await this.getLegacy()).updateSettings(settings);
    } else {
      super.updateSettings(settings);
    }
  }

  /**
   * Lightweight connection test to validate credentials.
   */
  async testConnection(): Promise<boolean> {
    if (this.isFallback()) {
      return (await this.getLegacy()).testConnection();
    }
    return super.testConnection();
  }

  /**
   * Exposes access to an initialised Session object when absolutely necessary.
   * NOTE: New code should avoid depending directly on the Session.
   */
  async getSession() {
    if (this.isFallback()) {
      return (await this.getLegacy()).getSession();
    }
    return super.getSession();
  }
}

export const ftrackAuthService = new FtrackAuthService(); 