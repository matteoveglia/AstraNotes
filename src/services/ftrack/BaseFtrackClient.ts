import { Session } from "@ftrack/api";
import type { FtrackSettings } from "@/types";
import { safeConsoleError } from "@/utils/errorHandling";
import { useSettings } from "@/store/settingsStore";

/**
 * BaseFtrackClient
 * -----------------
 * Centralises shared concerns required by all focused Ftrack services:
 *  - Managing and caching a single Session instance
 *  - Persisting / updating connection settings
 *  - Lightweight `testConnection` helper
 *
 * Note: During Phase 3.5 we keep logic intentionally minimal – just enough
 * to remove wrappers’ *direct* dependency on the monolith.  More helper
 * methods (caching utilities etc.) will be migrated here incrementally in
 * later sub-phases.
 */
export class BaseFtrackClient {
  private static _instance: BaseFtrackClient;
  private session: Session | null = null;
  private settings: FtrackSettings | null = null;

  constructor() {
    // Load persisted settings (same mechanism as monolith for now)
    const saved = localStorage.getItem("ftrackSettings");
    if (saved) {
      try {
        this.settings = JSON.parse(saved);
      } catch (err) {
        console.error("[BaseFtrackClient] Failed to parse saved settings", err);
      }
    }
  }

  /**
   * Singleton accessor so all wrapper services share the same session.
   */
  static get instance(): BaseFtrackClient {
    if (!this._instance) {
      this._instance = new BaseFtrackClient();
    }
    return this._instance;
  }

  updateSettings(settings: FtrackSettings) {
    // Update internal cache & persist
    this.settings = { ...settings };
    localStorage.setItem("ftrackSettings", JSON.stringify(settings));
    // Invalidate existing session so a fresh one is created lazily
    this.session = null;
  }

  /**
   * Create a new Session if not already initialised.
   */
  private async initSession(): Promise<Session | null> {
    if (
      !this.settings?.serverUrl ||
      !this.settings?.apiKey ||
      !this.settings?.apiUser
    ) {
      return null;
    }

    try {
      this.session = new Session(
        this.settings.serverUrl,
        this.settings.apiUser,
        this.settings.apiKey,
        {
          autoConnectEventHub: false,
        },
      );
      await this.session.initializing;
      return this.session;
    } catch (error) {
      // Keep error small – full error handling is still inside monolith path
      safeConsoleError(
        "[BaseFtrackClient] Failed to initialise session",
        error,
      );
      this.session = null;
      return null;
    }
  }

  async getSession(): Promise<Session> {
    if (this.session) return this.session;
    const sess = await this.initSession();
    if (!sess) {
      throw new Error("Failed to initialise ftrack session – check settings");
    }
    return sess;
  }

  async ensureSession(): Promise<Session> {
    return this.getSession();
  }

  async testConnection(): Promise<boolean> {
    try {
      const session = await this.ensureSession();
      if (!session) return false;
      // Simple query to validate
      const result = await session.query("select id from User limit 1");
      return !!result?.data?.length;
    } catch (err) {
      return false;
    }
  }

  /** Helper to know if monolith fallback is enabled */
  isFallbackEnabled(): boolean {
    return useSettings.getState().settings.useMonolithFallback;
  }

  /** Protected getter for settings access in derived classes */
  protected getSettings(): FtrackSettings | null {
    return this.settings;
  }
}

// Convenience singleton export
export const baseFtrackClient = BaseFtrackClient.instance;
