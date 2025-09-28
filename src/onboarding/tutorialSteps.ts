export type OnboardingStepId =
  | "welcome"
  | "openSettings"
  | "settingsOverview"
  | "enableDemoMode"
  | "playlistOrientation"
  | "playlistCreate"
  | "playlistRefresh"
  | "createQuickNotesPlaylist"
  | "versionSearch"
  | "convertQuickNotes"
  | "syncPlaylist"
  | "reviewSessionsNavigate"
  | "openPlaylist"
  | "noteEditor"
  | "noteAttachments"
  | "noteStatuses"
  | "noteRelated"
  | "publishNotes"
  | "playlistTools"
  | "completion";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  selector?: string;
  nextTrigger?: "manual" | "auto";
  waitFor?: {
    event:
      | "settingsOpen"
      | "demoModeEnabled"
      | "playlistCreated"
      | "versionAdded"
      | "playlistSynced"
      | "notesPublished"
      | "playlistRefreshed"
      | "playlistCategoryNavigated"
      | "reviewPlaylistOpened";
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
    id: "settingsOverview",
    title: "Connect Later, Explore Now",
    description:
      "Here’s where you’ll add your ftrack server URL, API user, and API key. You can come back any time to update credentials or tweak preferences before going live.",
    selector: '[data-onboarding-target="settings-overview"]',
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
    id: "playlistCreate",
    title: "Create a Playlist",
    description:
      "Use the plus button to create new playlists for fresh review sessions or ad-hoc lists.",
    selector: '[data-onboarding-target="playlist-create-button"]',
  },
  {
    id: "playlistRefresh",
    title: "Refresh from ftrack",
    description:
      "Pull the latest playlists from ftrack whenever you need to sync categories and sessions.",
    selector: '[data-onboarding-target="playlist-refresh-button"]',
    waitFor: { event: "playlistRefreshed" },
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
    id: "reviewSessionsNavigate",
    title: "Navigate Categories",
    description:
      "Use category controls to jump between demo lists and review sessions. Let’s head back to Review Sessions.",
    selector: '[data-onboarding-target="playlist-category-nav"]',
    waitFor: { event: "playlistCategoryNavigated" },
  },
  {
    id: "openPlaylist",
    title: "Open a Playlist",
    description:
      "Pick a playlist to review notes, attachments, statuses, and version info side-by-side.",
    selector: '[data-onboarding-target="playlist-first-item"]',
    waitFor: { event: "reviewPlaylistOpened" },
  },
  {
    id: "noteEditor",
    title: "Write Notes",
    description:
      "Use the markdown editor to capture feedback with rich formatting, checklists, and embedded context.",
    selector: '[data-onboarding-target="note-editor"]',
  },
  {
    id: "noteAttachments",
    title: "Attach References",
    description:
      "Add screenshots or annotated frames so reviewers see exactly what you mean.",
    selector: '[data-onboarding-target="note-attachments"]',
  },
  {
    id: "noteStatuses",
    title: "Manage Statuses",
    description:
      "Track each note’s progression—draft, ready, or published—so the team stays aligned.",
    selector: '[data-onboarding-target="note-statuses"]',
  },
  {
    id: "noteRelated",
    title: "Related Context",
    description:
      "Open related notes, versions, detailed metadata, or jump to ftrack without leaving your flow.",
    selector: '[data-onboarding-target="note-related"]',
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
    id: "playlistTools",
    title: "Playlist Tools",
    description:
      "Use the playlist menu for exports, bulk updates, thumbnails, or clearing drafts—your admin toolkit in one spot.",
    selector: '[data-onboarding-target="playlist-tools"]',
  },
  {
    id: "completion",
    title: "All Done",
    description:
      "That’s it! You can replay the tutorial anytime from Settings → Help & Support.",
    nextTrigger: "manual",
  },
];
