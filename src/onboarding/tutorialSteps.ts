export type OnboardingStepId =
  | "welcome"
  | "openSettings"
  | "enableDemoMode"
  | "playlistOrientation"
  | "createQuickNotesPlaylist"
  | "versionSearch"
  | "convertQuickNotes"
  | "syncPlaylist"
  | "openPlaylist"
  | "notesWorkflow"
  | "publishNotes"
  | "completion";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  selector?: string;
  nextTrigger?: "manual" | "auto";
  waitFor?: {
    event: "settingsOpen" | "demoModeEnabled" | "playlistCreated" | "versionAdded" | "playlistSynced" | "notesPublished";
  };
}

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to AstraNotes",
    description:
      "Let’s take a quick tour to get you connected and comfortable. You can exit any time from the toolbar or Settings.",
    nextTrigger: "manual",
  },
  {
    id: "openSettings",
    title: "Open Settings",
    description:
      "Start by opening the Settings panel to review your connection or switch to Demo Mode.",
    selector: '[data-onboarding-target="settings-button"]',
    waitFor: { event: "settingsOpen" },
  },
  {
    id: "enableDemoMode",
    title: "Enable Demo Mode",
    description:
      "Toggle Demo Mode to explore AstraNotes with a rich sample project. We’ll restart with demo data ready to use.",
    waitFor: { event: "demoModeEnabled" },
    selector: '[data-onboarding-target="demo-mode-toggle"]',
  },
  {
    id: "playlistOrientation",
    title: "Explore Playlists",
    description:
      "This panel lists playlists grouped by Review Sessions and List categories. Use the plus to create and the arrows to navigate.",
    selector: '[data-onboarding-target="playlist-panel"]',
  },
  {
    id: "createQuickNotesPlaylist",
    title: "Quick Notes",
    description:
      "Quick Notes is your scratchpad. Add versions here before turning them into a formal playlist.",
    selector: '[data-onboarding-target="quick-notes-tab"]',
  },
  {
    id: "versionSearch",
    title: "Search Versions",
    description:
      "Use multi-select search to add the versions you need. Checkboxes let you queue up multiple versions before adding.",
    selector: '[data-onboarding-target="version-search"]',
    waitFor: { event: "versionAdded" },
  },
  {
    id: "convertQuickNotes",
    title: "Create a Playlist",
    description:
      "Convert Quick Notes into a dedicated list playlist to organise review sessions.",
    selector: '[data-onboarding-target="quick-notes-convert"]',
    waitFor: { event: "playlistCreated" },
  },
  {
    id: "syncPlaylist",
    title: "Sync to ftrack",
    description:
      "Sync playlists when you’re ready to share updates with ftrack collaborators.",
    selector: '[data-onboarding-target="sync-playlist-button"]',
    waitFor: { event: "playlistSynced" },
  },
  {
    id: "openPlaylist",
    title: "Open a Playlist",
    description:
      "Pick a playlist to review notes, attachments, statuses, and version info side-by-side.",
    selector: '[data-onboarding-target="open-playlists-bar"]',
  },
  {
    id: "notesWorkflow",
    title: "Review Notes",
    description:
      "Use the note editor, attachments, statuses, and related versions to prepare feedback.",
    selector: '[data-onboarding-target="version-grid"]',
  },
  {
    id: "publishNotes",
    title: "Publish",
    description:
      "Publish individual notes or everything at once when you’re ready to send to ftrack.",
    selector: '[data-onboarding-target="publishing-controls"]',
    waitFor: { event: "notesPublished" },
  },
  {
    id: "completion",
    title: "All Done",
    description:
      "That’s it! You can replay the tutorial anytime from Settings → Help & Support.",
    nextTrigger: "manual",
  },
];
