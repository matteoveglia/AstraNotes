import { ftrackService } from "../legacy/ftrack";
import { BaseFtrackClient } from "./BaseFtrackClient";
import { useSettings } from "@/store/settingsStore";
import type { FtrackSettings } from "@/types";

export class FtrackAuthService extends BaseFtrackClient {
  private isFallback() {
    return useSettings.getState().settings.useMonolithFallback;
  }
  /**
   * Updates the stored connection credentials/settings. Delegates to legacy service for now.
   */
  updateSettings(settings: FtrackSettings) {
    if (this.isFallback()) {
      ftrackService.updateSettings(settings);
    } else {
      super.updateSettings(settings);
    }
  }

  /**
   * Lightweight connection test to validate credentials.
   */
  async testConnection(): Promise<boolean> {
    return this.isFallback()
      ? ftrackService.testConnection()
      : super.testConnection();
  }

  /**
   * Exposes access to an initialised Session object when absolutely necessary.
   * NOTE: New code should avoid depending directly on the Session.
   */
  async getSession() {
    return this.isFallback()
      ? (ftrackService as any).getSession()
      : super.getSession();
  }
}

export const ftrackAuthService = new FtrackAuthService(); 