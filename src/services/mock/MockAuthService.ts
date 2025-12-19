import type { FtrackSettings } from "@/types";
import type { AuthServiceContract } from "@/services/client/types";

const delay = async () =>
	new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 140));

export const mockAuthService: AuthServiceContract = {
	async updateSettings(_settings: FtrackSettings): Promise<void> {
		await delay();
	},
	async testConnection(): Promise<boolean> {
		await delay();
		return true;
	},
	async getSession(): Promise<never> {
		throw new Error("MockAuthService.getSession not available in demo mode");
	},
};
