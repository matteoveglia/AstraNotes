import { demoSeed } from "@/services/mock/demoSeed";
import type { AssetVersion } from "@/types";

const latency = async () =>
  new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));

const seededVersions = demoSeed.assetVersions.map<AssetVersion>((seed) => ({
  id: seed.id,
  name: seed.displayName,
  version: seed.versionNumber,
  createdAt: seed.publishedAt,
  updatedAt: seed.publishedAt,
  manuallyAdded: false,
  thumbnailId: seed.componentIds[0],
}));

const versionById = new Map(seededVersions.map((version) => [version.id, version]));
const seedById = new Map(demoSeed.assetVersions.map((version) => [version.id, version]));

const componentMetadata = new Map(
  demoSeed.assetVersions.flatMap((version) =>
    version.componentIds.map((componentId) => [componentId, version]),
  ),
);

interface SearchVersionsOptions {
  searchTerm: string;
  limit?: number;
  projectId?: string;
}

export const mockVersionService = {
  async searchVersions({
    searchTerm,
    limit = 50,
  }: SearchVersionsOptions): Promise<AssetVersion[]> {
    await latency();

    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return [];
    }

    const filtered = seededVersions.filter((version) =>
      version.name.toLowerCase().includes(term) || version.id.toLowerCase().includes(term),
    );

    return filtered.slice(0, limit);
  },
  async getVersionComponents(versionId: string) {
    await latency();
    const seed = seedById.get(versionId);
    if (!seed) {
      return [];
    }

    return seed.componentIds.map((componentId) => ({
      id: componentId,
      name: "demo-mp4",
      file_type: "video/mp4",
      metadata: {
        movieFilename: seed.movieFilename ?? null,
      },
    }));
  },
  async fetchVersionDetails(versionId: string) {
    await latency();
    const seed = seedById.get(versionId);
    if (!seed) {
      return null;
    }

    return {
      id: seed.id,
      assetName: seed.displayName,
      versionNumber: seed.versionNumber,
      description: seed.description,
      assetType: seed.assetType,
      publishedBy: seed.publishedBy,
      publishedAt: seed.publishedAt,
    };
  },
  async getComponentUrl(componentId: string) {
    await latency();
    const version = componentMetadata.get(componentId);

    if (!version || !version.movieFilename) {
      return null;
    }

    return `app://demo/${version.movieFilename}`;
  },
};
