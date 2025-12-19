import { Session } from "@ftrack/api";
import type { FtrackSettings } from "@/types";
import { safeConsoleError } from "@/utils/errorHandling";
import { debugLog } from "@/lib/verboseLogging";

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
		debugLog("[BaseFtrackClient] updateSettings invoked", {
			hasServerUrl: Boolean(settings.serverUrl),
			hasApiKey: Boolean(settings.apiKey),
			hasApiUser: Boolean(settings.apiUser),
		});
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
		debugLog("[BaseFtrackClient] getSession requested", {
			sessionState: BaseFtrackClient.sessionState.kind,
		});
		const existing = BaseFtrackClient.getExistingSession();
		if (existing) {
			debugLog("[BaseFtrackClient] Reusing cached session");
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
			debugLog("[BaseFtrackClient] testConnection starting");
			const session = await this.ensureSession();
			if (!session) return false;
			const result = await session.query("select id from User limit 1");
			debugLog("[BaseFtrackClient] testConnection result", {
				hasData: Boolean(result?.data?.length),
			});
			return !!result?.data?.length;
		} catch (err) {
			debugLog("[BaseFtrackClient] testConnection error", {
				errorName: err instanceof Error ? err.name : typeof err,
			});
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
		if (BaseFtrackClient.settings || typeof window === "undefined") {
			return;
		}

		const saved = window.localStorage.getItem("ftrackSettings");
		debugLog("[BaseFtrackClient] ensureSettingsLoaded invoked", {
			storageHit: Boolean(saved),
		});
		if (saved) {
			try {
				BaseFtrackClient.settings = JSON.parse(saved) as FtrackSettings;
				debugLog("[BaseFtrackClient] Settings loaded from storage", {
					hasServerUrl: Boolean(BaseFtrackClient.settings?.serverUrl),
					hasApiKey: Boolean(BaseFtrackClient.settings?.apiKey),
					hasApiUser: Boolean(BaseFtrackClient.settings?.apiUser),
				});
			} catch (err) {
				console.error("[BaseFtrackClient] Failed to parse saved settings", err);
				BaseFtrackClient.settings = null;
			}
		}
	}

	private static getExistingSession(): Session | null {
		if (BaseFtrackClient.sessionState.kind === "ready") {
			return BaseFtrackClient.sessionState.session;
		}
		return null;
	}

	private static resetSession() {
		if (BaseFtrackClient.sessionState.kind === "ready") {
			try {
				const maybeClosable = BaseFtrackClient.sessionState
					.session as unknown as {
					close?: () => void;
				};
				maybeClosable.close?.();
			} catch (err) {
				safeConsoleError("[BaseFtrackClient] Failed to close session", err);
			}
		}
		debugLog("[BaseFtrackClient] Resetting shared session state");
		BaseFtrackClient.sessionState = { kind: "idle" };
	}

	private static ensureSessionInitializing(): Promise<Session | null> {
		debugLog("[BaseFtrackClient] ensureSessionInitializing invoked", {
			sessionState: BaseFtrackClient.sessionState.kind,
		});
		if (BaseFtrackClient.sessionState.kind === "initializing") {
			return BaseFtrackClient.sessionState.promise;
		}

		if (BaseFtrackClient.sessionState.kind === "ready") {
			return Promise.resolve(BaseFtrackClient.sessionState.session);
		}

		const settings = BaseFtrackClient.settings;
		debugLog("[BaseFtrackClient] ensureSessionInitializing settings snapshot", {
			hasServerUrl: Boolean(settings?.serverUrl),
			hasApiKey: Boolean(settings?.apiKey),
			hasApiUser: Boolean(settings?.apiUser),
		});
		if (!settings?.serverUrl || !settings?.apiKey || !settings?.apiUser) {
			debugLog("[BaseFtrackClient] Missing credentials; aborting session init");
			return Promise.resolve(null);
		}

		const initializationPromise = (async () => {
			try {
				const session = new Session(
					settings.serverUrl,
					settings.apiUser,
					settings.apiKey,
					{
						autoConnectEventHub: false,
					},
				);
				await session.initializing;
				debugLog("[BaseFtrackClient] Session initialised successfully");
				BaseFtrackClient.sessionState = { kind: "ready", session };
				return session;
			} catch (error) {
				safeConsoleError(
					"[BaseFtrackClient] Failed to initialise session",
					error,
				);
				debugLog("[BaseFtrackClient] Session init failed", {
					errorName: error instanceof Error ? error.name : typeof error,
					errorMessage:
						error instanceof Error ? error.message : String(error ?? ""),
				});
				BaseFtrackClient.sessionState = { kind: "idle" };
				return null;
			}
		})();

		BaseFtrackClient.sessionState = {
			kind: "initializing",
			promise: initializationPromise,
		};
		return initializationPromise;
	}
}

// Convenience re-export for legacy imports
export const baseFtrackClient = new BaseFtrackClient();
