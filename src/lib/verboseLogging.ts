import { useSettings } from "../store/settingsStore";

const envVerboseDefault = import.meta.env.VITE_VERBOSE_DEBUG === "true";

export function isVerboseLoggingEnabled(): boolean {
	const state = useSettings.getState();
	const verbosePref = state.settings.verboseLogging;
	if (typeof verbosePref === "boolean") {
		return verbosePref;
	}
	return envVerboseDefault;
}

export function debugLog(...args: unknown[]): void {
	if (isVerboseLoggingEnabled()) {
		console.debug(...args);
	}
}
