/**
 * @fileoverview themeStore.ts
 * Manages application theme (light/dark), persisted to localStorage.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeState {
	/** Current theme */
	theme: Theme;
	/** Set theme explicitly */
	setTheme: (theme: Theme) => void;
	/** Toggle between light and dark themes */
	toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme: "light",
			setTheme: (theme) => set({ theme }),
			toggleTheme: () =>
				set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
		}),
		{
			name: "theme-storage",
		},
	),
);
