/**
 * @fileoverview githubService.ts
 * Service for fetching release information from GitHub API.
 * Used to display What's New modal with latest release notes.
 */

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

class GitHubService {
  private readonly baseUrl = "https://api.github.com";
  private readonly owner = "matteoveglia";
  private readonly repo = "AstraNotes";

  /**
   * Fetches the latest release from GitHub
   * @returns Promise resolving to the latest release data
   */
  async getLatestRelease(): Promise<GitHubRelease> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AstraNotes-App",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      const release: GitHubRelease = await response.json();
      return release;
    } catch (error) {
      console.error("Failed to fetch latest release:", error);
      throw error;
    }
  }

  /**
   * Fetches a specific release by tag name
   * @param tagName - The tag name of the release (e.g., "v0.7.1")
   * @returns Promise resolving to the release data
   */
  async getReleaseByTag(tagName: string): Promise<GitHubRelease> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/releases/tags/${tagName}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AstraNotes-App",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      const release: GitHubRelease = await response.json();
      return release;
    } catch (error) {
      console.error(`Failed to fetch release ${tagName}:`, error);
      throw error;
    }
  }

  /**
   * Formats release notes markdown for display
   * @param body - The markdown body from GitHub release
   * @returns Formatted release notes
   */
  formatReleaseNotes(body: string): string {
    // Clean up the markdown for better display
    return body
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/#{1,6}\s/g, (match) => match) // Keep headers as-is
      .trim();
  }
}

export const githubService = new GitHubService();
