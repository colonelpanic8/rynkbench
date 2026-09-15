import type {
  FirmwareReleaseSource,
  FirmwareTarget,
  FirmwareUpdateProfile,
} from "../model/boards/profile";

export interface FirmwareReleaseAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
  archiveEntryPattern?: string;
}

export interface ResolvedFirmwareTarget {
  target: FirmwareTarget;
  asset: FirmwareReleaseAsset;
}

export interface FirmwareRelease {
  tag: string;
  name: string;
  publishedAt: string;
  sourceRevision: string;
  pageUrl: string;
  targets: ResolvedFirmwareTarget[];
}

interface GithubAsset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
  digest?: unknown;
}

interface GithubRelease {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  target_commitish?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Latest release has no valid ${field}`);
  }
  return value;
}

export function matchReleaseAsset(
  assets: readonly GithubAsset[],
  target: FirmwareTarget,
): FirmwareReleaseAsset {
  let matched: { asset: GithubAsset; archiveEntryPattern?: string } | undefined;
  for (const location of target.locations) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(location.assetPattern);
      if (location.archiveEntryPattern) new RegExp(location.archiveEntryPattern);
    } catch {
      throw new Error(`Invalid firmware asset pattern for ${target.label}`);
    }
    const matches = assets.filter(
      (asset) => typeof asset.name === "string" && pattern.test(asset.name),
    );
    if (matches.length > 1) {
      throw new Error(`Latest release has multiple matching firmware assets for ${target.label}`);
    }
    if (matches.length === 1) {
      matched = { asset: matches[0], archiveEntryPattern: location.archiveEntryPattern };
      break;
    }
  }
  if (!matched) {
    throw new Error(`Latest release has no matching firmware asset for ${target.label}`);
  }
  const { asset, archiveEntryPattern } = matched;
  if (typeof asset.digest !== "string") {
    throw new Error(`${target.label} release asset has no SHA-256 digest`);
  }
  const digest = asset.digest;
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(digest)?.[1].toLowerCase();
  if (!sha256) throw new Error(`${target.label} release asset has no SHA-256 digest`);
  if (typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
    throw new Error(`${target.label} release asset has no valid size`);
  }
  return {
    name: stringField(asset.name, `${target.label} asset name`),
    url: stringField(asset.browser_download_url, `${target.label} download URL`),
    size: asset.size,
    sha256,
    archiveEntryPattern,
  };
}

function githubApiUrl(source: FirmwareReleaseSource): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository)) {
    throw new Error("Firmware release repository must be an owner/name pair");
  }
  return `https://api.github.com/repos/${source.repository}/releases/latest`;
}

export function parseGithubRelease(
  raw: GithubRelease,
  profile: FirmwareUpdateProfile,
): FirmwareRelease {
  if (!Array.isArray(raw.assets)) throw new Error("Latest release has no asset list");
  return {
    tag: stringField(raw.tag_name, "tag"),
    name: stringField(raw.name, "name"),
    publishedAt: stringField(raw.published_at, "publication time"),
    sourceRevision: stringField(raw.target_commitish, "source revision"),
    pageUrl: stringField(raw.html_url, "page URL"),
    targets: profile.targets.map((target) => ({
      target,
      asset: matchReleaseAsset(raw.assets as GithubAsset[], target),
    })),
  };
}

export async function latestFirmwareRelease(
  profile: FirmwareUpdateProfile,
  signal?: AbortSignal,
): Promise<FirmwareRelease> {
  switch (profile.source.kind) {
    case "github-latest-release": {
      const response = await fetch(githubApiUrl(profile.source), {
        signal,
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) {
        throw new Error(`Could not load latest firmware release (HTTP ${response.status})`);
      }
      return parseGithubRelease(await response.json() as GithubRelease, profile);
    }
  }
}

export function sameRevision(left: string | undefined, right: string): boolean {
  if (!left || !/^[0-9a-f]{7,40}$/i.test(left) || !/^[0-9a-f]{7,40}$/i.test(right)) {
    return false;
  }
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a.startsWith(b) || b.startsWith(a);
}

/** Keep the control-bearing central alive until every peripheral is flashed. */
export function firmwareInstallOrder(
  targets: readonly ResolvedFirmwareTarget[],
): ResolvedFirmwareTarget[] {
  return [...targets].sort((a, b) => {
    const rank = (entry: ResolvedFirmwareTarget) => entry.target.bootloader.kind === "central" ? 1 : 0;
    return rank(a) - rank(b);
  });
}
