import { describe, it, expect, vi } from "vitest";
import { renderWithUserEvent, screen, act } from "@/test/utils";
import { TopBar } from "@/components/TopBar";

// Mock WhatsNewModal component
vi.mock("@/components/WhatsNewModal", () => ({
	WhatsNewModal: ({ autoShow, onModalShouldClose }: any) => (
		<div data-testid="whats-new-modal" />
	),
}));

// Mock SettingsModal component
vi.mock("@/components/SettingsModal", () => ({
	SettingsModal: ({ onLoadPlaylists, onCloseAllPlaylists }: any) => (
		<button data-testid="settings-modal" aria-label="settings">
			Settings
		</button>
	),
}));

// Mock ProjectSelector component
vi.mock("@/components/ProjectSelector", () => ({
	ProjectSelector: ({ onProjectChange }: any) => (
		<div data-testid="project-selector">Project Selector</div>
	),
}));

// Mock project store
vi.mock("@/store/projectStore", () => ({
	useProjectStore: (selector: any) => {
		const state = {
			selectedProject: null,
			availableProjects: [],
			isLoading: false,
			setSelectedProject: vi.fn(),
			loadProjects: vi.fn(),
		};
		return selector ? selector(state) : state;
	},
}));

// Mock any hooks, store, or context the component might be using
vi.mock("@/store/uiStore", () => ({
	useUIStore: () => ({
		showSettings: false,
		setShowSettings: vi.fn(),
	}),
}));

// Mock settings hook
vi.mock("@/store/settingsStore", () => ({
	useSettings: () => ({
		settings: {
			autoRefreshEnabled: true,
		},
	}),
}));

// Mock connection status hook
vi.mock("@/hooks/useConnectionStatus", () => ({
	useConnectionStatus: () => ({
		isConnected: false,
	}),
}));

// Mock update store
vi.mock("@/store/updateStore", () => ({
	useUpdateStore: () => ({
		shouldShowNotification: () => false,
		shouldHighlightNotification: () => false,
		updateVersion: "1.0.0",
	}),
}));

// Mock theme store
vi.mock("@/store/themeStore", () => ({
	useThemeStore: (selector: any) => {
		const state = {
			theme: "light",
			toggleTheme: vi.fn(),
		};
		return selector ? selector(state) : state;
	},
}));

describe("TopBar", () => {
	it("renders correctly", async () => {
		await act(async () => {
			renderWithUserEvent(
				<TopBar
					onLoadPlaylists={async () => {}}
					onCloseAllPlaylists={() => {}}
				/>,
			);
		});

		// Updated assertion to look for the heading instead of banner role
		expect(screen.getByText("AstraNotes")).toBeInTheDocument();
	});

	it("handles settings button click", async () => {
		const { user } = await act(async () => {
			return renderWithUserEvent(
				<TopBar
					onLoadPlaylists={async () => {}}
					onCloseAllPlaylists={() => {}}
				/>,
			);
		});

		// Find settings button in the rendered component
		const settingsButton = screen.getByTestId("settings-modal");
		expect(settingsButton).toBeInTheDocument();

		// Click the settings button
		await act(async () => {
			await user.click(settingsButton);
		});

		// Add assertions for expected behavior after click if needed
	});
});
