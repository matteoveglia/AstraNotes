import { BaseFtrackClient } from "./BaseFtrackClient";
import type { AssetVersion } from "@/types";
import type { VersionServiceContract } from "@/services/client/types";

interface SearchVersionsOptions {
  searchTerm: string;
  limit?: number;
  projectId?: string | null;
}

export class FtrackVersionService
  extends BaseFtrackClient
  implements VersionServiceContract
{
  /* helpers */
  // simple in-memory cache (5-minute TTL)
  private searchCache = new Map<string, { ts: number; data: AssetVersion[] }>();

  /**
   * Searches versions by search term (supports project filtering).
   */
  async searchVersions(
    options: SearchVersionsOptions,
  ): Promise<AssetVersion[]> {
    const key = JSON.stringify(options);
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.ts < 5 * 60_000) {
      return cached.data;
    }

    const { searchTerm, limit = 50, projectId } = options;
    const session = await this.getSession();

    // parse version pattern v### or _v###
    const versionMatch = searchTerm.match(/[_]?v(\d+)/i);
    const nameSearch = versionMatch
      ? searchTerm.replace(/[_]?v\d+/i, "").trim()
      : searchTerm.trim();

    let where = "";
    if (nameSearch) where += `asset.name like "%${nameSearch}%"`;
    if (versionMatch) {
      if (where) where += " and ";
      where += `version = ${versionMatch[1]}`;
    }
    if (projectId) {
      if (where) where += " and ";
      where += `asset.parent.project_id is "${projectId}"`;
    }
    if (!where) return [];

    const query = `select id, version, asset.name, thumbnail.id, date from AssetVersion where ${where} order by date desc limit ${limit * 2}`;
    const result = await session.query(query);

    const filtered = nameSearch
      ? result?.data?.filter((v: any) =>
          v.asset.name.toLowerCase().includes(nameSearch.toLowerCase()),
        )
      : result?.data;

    const data: AssetVersion[] = (filtered || [])
      .slice(0, limit)
      .map((v: any) => ({
        id: v.id,
        name: v.asset.name,
        version: v.version,
        thumbnailId: v.thumbnail?.id,
        createdAt: v.date || new Date().toISOString(),
        updatedAt: v.date || new Date().toISOString(),
        manuallyAdded: false,
      }));

    this.searchCache.set(key, { ts: Date.now(), data });
    return data;
  }

  /**
   * Fetches the components for a specific AssetVersion (used for download URL, etc.).
   */
  async getVersionComponents(versionId: string) {
    const session = await this.getSession();
    const query = `select id, name, component_locations, file_type from Component where version_id is "${versionId}"`;
    const result = await session.query(query);
    return result.data;
  }

  /**
   * Fetches detailed information about an AssetVersion.
   */
  async fetchVersionDetails(assetVersionId: string) {
    const session = await this.getSession();
    const query = `select id, version, comment, date, asset.name, asset.type.name, user.first_name, user.last_name, user.username from AssetVersion where id is "${assetVersionId}"`;
    const result = await session.query(query);
    if (!result?.data?.length) return null;
    const row = result.data[0];
    return {
      id: row.id,
      assetName: row["asset.name"] ?? row.asset?.name,
      versionNumber: row.version,
      description: row.comment || undefined,
      assetType: row["asset.type.name"] ?? row.asset?.type?.name,
      publishedBy:
        `${row["user.first_name"] || row.user?.first_name || ""} ${row["user.last_name"] || row.user?.last_name || ""}`.trim() ||
        row["user.username"] ||
        row.user?.username,
      publishedAt: row.date,
    };
  }

  /**
   * Get URL for a specific component.
   */
  async getComponentUrl(componentId: string): Promise<string | null> {
    const session = await this.getSession();
    try {
      const url = await session.getComponentUrl(componentId);
      return url ?? null;
    } catch (err) {
      console.error("[FtrackVersionService] getComponentUrl failed", err);
      return null;
    }
  }
}

export const ftrackVersionService = new FtrackVersionService();
