export type OnboardingEvent =
  | "settingsOpen"
  | "settingsClosed"
  | "demoModeEnabled"
  | "projectSelectorOpened"
  | "projectSelected"
  | "playlistCreated"
  | "versionAdded"
  | "playlistSynced"
  | "notesPublished"
  | "playlistRefreshed"
  | "playlistCategoryNavigated"
  | "reviewPlaylistOpened";

export type OnboardingEventListener = (event: OnboardingEvent) => void;

const listeners = new Set<OnboardingEventListener>();

export function emitOnboardingEvent(event: OnboardingEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error("[OnboardingEvents] Listener failed", error);
    }
  });
}

export function subscribeOnboardingEvents(
  listener: OnboardingEventListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
