import { BaseFtrackClient } from "./BaseFtrackClient";
import type { FtrackSettings } from "@/types";

export class FtrackAuthService extends BaseFtrackClient {
  /**
   * Updates the stored connection credentials/settings.
   */
  async updateSettings(settings: FtrackSettings) {
    super.updateSettings(settings);
  }

  /**
   * Lightweight connection test to validate credentials.
   */
  async testConnection(): Promise<boolean> {
    return super.testConnection();
  }

  /**
   * Exposes access to an initialised Session object when absolutely necessary.
   * NOTE: New code should avoid depending directly on the Session.
   */
  async getSession() {
    return super.getSession();
  }
}

export const ftrackAuthService = new FtrackAuthService();
