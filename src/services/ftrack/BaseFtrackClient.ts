import { Session } from "@ftrack/api";
import type { FtrackSettings } from "@/types";
import { safeConsoleError } from "@/utils/errorHandling";

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
type SessionReadyState =
  | { kind: "idle" }
  | { kind: "initializing"; promise: Promise<Session | null> }
  | { kind: "ready"; session: Session };

export class BaseFtrackClient {
  private static settings: FtrackSettings | null = null;
  private static sessionState: SessionReadyState = { kind: "idle" };

  constructor() {
    BaseFtrackClient.ensureSettingsLoaded();
  }

  /**
   * Persist settings and reset the shared session.
   */
  updateSettings(settings: FtrackSettings) {
    BaseFtrackClient.settings = { ...settings };
    if (typeof window !== "undefined") {
      localStorage.setItem("ftrackSettings", JSON.stringify(settings));
    }
    BaseFtrackClient.resetSession();
  }

  /**
   * Returns the shared Session instance, creating it if necessary.
   */
  async getSession(): Promise<Session> {
    const existing = BaseFtrackClient.getExistingSession();
    if (existing) {
      return existing;
    }

    const initialization = BaseFtrackClient.ensureSessionInitializing();
    const session = await initialization;
    if (!session) {
      throw new Error("Failed to initialise ftrack session – check settings");
    }
    return session;
  }

  /**
   * Alias kept for legacy usage in downstream services.
   */
  async ensureSession(): Promise<Session> {
    return this.getSession();
  }

  async testConnection(): Promise<boolean> {
    try {
      const session = await this.ensureSession();
      if (!session) return false;
      const result = await session.query("select id from User limit 1");
      return !!result?.data?.length;
    } catch (err) {
      return false;
    }
  }

  /** Convenience accessor for derived classes */
  protected getSettings(): FtrackSettings | null {
    BaseFtrackClient.ensureSettingsLoaded();
    return BaseFtrackClient.settings;
  }

  /**
   * Shared helpers
   */
  private static ensureSettingsLoaded() {
    if (this.settings || typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem("ftrackSettings");
    if (saved) {
      try {
        this.settings = JSON.parse(saved) as FtrackSettings;
      } catch (err) {
        console.error("[BaseFtrackClient] Failed to parse saved settings", err);
        this.settings = null;
      }
    }
  }

  private static getExistingSession(): Session | null {
    if (this.sessionState.kind === "ready") {
      return this.sessionState.session;
    }
    return null;
  }

  private static resetSession() {
    if (this.sessionState.kind === "ready") {
      try {
        const maybeClosable = this.sessionState.session as unknown as {
          close?: () => void;
        };
        maybeClosable.close?.();
      } catch (err) {
        safeConsoleError("[BaseFtrackClient] Failed to close session", err);
      }
    }
    this.sessionState = { kind: "idle" };
  }

  private static ensureSessionInitializing(): Promise<Session | null> {
    if (this.sessionState.kind === "initializing") {
      return this.sessionState.promise;
    }

    if (this.sessionState.kind === "ready") {
      return Promise.resolve(this.sessionState.session);
    }

    const settings = this.settings;
    if (!settings?.serverUrl || !settings?.apiKey || !settings?.apiUser) {
      return Promise.resolve(null);
    }

    const initializationPromise = (async () => {
      try {
        const session = new Session(settings.serverUrl, settings.apiUser, settings.apiKey, {
          autoConnectEventHub: false,
        });
        await session.initializing;
        this.sessionState = { kind: "ready", session };
        return session;
      } catch (error) {
        safeConsoleError("[BaseFtrackClient] Failed to initialise session", error);
        this.sessionState = { kind: "idle" };
        return null;
      }
    })();

    this.sessionState = { kind: "initializing", promise: initializationPromise };
    return initializationPromise;
  }
}

// Convenience re-export for legacy imports
export const baseFtrackClient = new BaseFtrackClient();
