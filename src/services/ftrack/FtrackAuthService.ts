import { ftrackService } from "../legacy/ftrack";
import type { FtrackSettings } from "@/types";

export class FtrackAuthService {
  /**
   * Updates the stored connection credentials/settings. Delegates to legacy service for now.
   */
  updateSettings(settings: FtrackSettings) {
    ftrackService.updateSettings(settings);
  }

  /**
   * Lightweight connection test to validate credentials.
   */
  async testConnection(): Promise<boolean> {
    return ftrackService.testConnection();
  }

  /**
   * Exposes access to an initialised Session object when absolutely necessary.
   * NOTE: New code should avoid depending directly on the Session.
   */
  async getSession() {
    // Accessing a private method on the legacy service – cast to `any` while we complete the migration.
    return (ftrackService as any).getSession();
  }
}

export const ftrackAuthService = new FtrackAuthService(); 