/**
 * @fileoverview projectStore.ts
 * Zustand store for project selection and management.
 * Features localStorage persistence for selected project.
 * @store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { playlistClient } from "@/services/client";
import type { Project } from "@/types";

interface ProjectState {
	projects: Project[];
	selectedProjectId: string | null; // null = "All Projects"
	isLoading: boolean;
	error: string | null;
	hasValidatedSelectedProject: boolean;

	// Actions
	setProjects: (projects: Project[]) => void;
	setSelectedProject: (projectId: string | null) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	loadProjects: () => Promise<void>;
	validateSelectedProject: () => Promise<boolean>;
}

export const useProjectStore = create<ProjectState>()(
	persist(
		(set, get) => ({
			projects: [],
			selectedProjectId: null, // Start with no project (triggers glow effect)
			isLoading: false,
			error: null,
			hasValidatedSelectedProject: false,

			setProjects: (projects) => set({ projects }),

			setSelectedProject: (projectId) =>
				set({
					selectedProjectId: projectId,
					hasValidatedSelectedProject: projectId !== null,
				}),

			setLoading: (loading) => set({ isLoading: loading }),
			setError: (error) => set({ error }),

			loadProjects: async () => {
				set({ isLoading: true, error: null });

				try {
					const projects = await playlistClient().getProjects();

					// Validate selected project exists after loading projects
					const { selectedProjectId } = get();
					let hasValidSelectedProject = false;

					if (selectedProjectId) {
						const exists = projects.find((p) => p.id === selectedProjectId);
						if (exists) {
							hasValidSelectedProject = true;
						} else {
							// Project no longer exists, clear selection
							set({ selectedProjectId: null });
						}
					}

					set({
						projects,
						isLoading: false,
						hasValidatedSelectedProject: hasValidSelectedProject,
					});
				} catch (error) {
					set({
						error:
							error instanceof Error
								? error.message
								: "Failed to load projects",
						isLoading: false,
					});
				}
			},

			validateSelectedProject: async () => {
				const { selectedProjectId, projects } = get();
				if (!selectedProjectId) {
					set({ hasValidatedSelectedProject: false });
					return false;
				}

				const exists = projects.find((p) => p.id === selectedProjectId);
				const isValid = !!exists;

				set({ hasValidatedSelectedProject: isValid });

				if (!isValid) {
					set({ selectedProjectId: null });
				}

				return isValid;
			},
		}),
		{
			name: "astranotes-project-selection",
			partialize: (state) => ({
				selectedProjectId: state.selectedProjectId,
			}),
		},
	),
);
