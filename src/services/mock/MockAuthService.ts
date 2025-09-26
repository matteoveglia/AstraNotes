const delay = async () =>
  new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 140));

export const mockAuthService = {
  async updateSettings(): Promise<void> {
    await delay();
  },
  async testConnection(): Promise<boolean> {
    await delay();
    return true;
  },
  async getSession() {
    throw new Error("MockAuthService.getSession not available in demo mode");
  },
};
