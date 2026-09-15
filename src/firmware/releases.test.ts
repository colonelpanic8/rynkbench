import { describe, expect, it } from "vitest";
import type { FirmwareUpdateProfile } from "../model/boards/profile";
import {
  firmwareInstallOrder,
  parseGithubRelease,
  sameRevision,
} from "./releases";

const profile: FirmwareUpdateProfile = {
  source: { kind: "github-latest-release", repository: "acme/keyboards", label: "Acme" },
  targets: [
    {
      id: "central",
      label: "Central",
      locations: [{ assetPattern: "^board-central\\.uf2$" }],
      uf2FamilyId: 1,
      bootloader: { kind: "central" },
      volumeLabels: ["BOARD"],
    },
    {
      id: "peripheral",
      label: "Peripheral",
      locations: [{ assetPattern: "^board-peripheral\\.uf2$" }],
      uf2FamilyId: 2,
      bootloader: { kind: "peripheral", slot: 0 },
      volumeLabels: ["BOARDP"],
    },
  ],
};

const digest = `sha256:${"a".repeat(64)}`;

describe("firmware releases", () => {
  it("resolves every profile target from a generic GitHub release", () => {
    const release = parseGithubRelease({
      tag_name: "v1.2.3",
      name: "Firmware 1.2.3",
      published_at: "2026-09-14T00:00:00Z",
      target_commitish: "1234567890abcdef",
      html_url: "https://github.com/acme/keyboards/releases/tag/v1.2.3",
      assets: [
        { name: "board-central.uf2", browser_download_url: "https://example/central", size: 512, digest },
        { name: "board-peripheral.uf2", browser_download_url: "https://example/peripheral", size: 1024, digest },
      ],
    }, profile);

    expect(release.targets.map(({ target, asset }) => [target.id, asset.name])).toEqual([
      ["central", "board-central.uf2"],
      ["peripheral", "board-peripheral.uf2"],
    ]);
    expect(firmwareInstallOrder(release.targets).map(({ target }) => target.id)).toEqual([
      "peripheral",
      "central",
    ]);
  });

  it("refuses ambiguous or unhashed release assets", () => {
    const base = {
      tag_name: "v1",
      name: "Firmware",
      published_at: "2026-09-14T00:00:00Z",
      target_commitish: "1234567",
      html_url: "https://example/release",
    };
    expect(() => parseGithubRelease({ ...base, assets: [] }, profile)).toThrow("no matching");
    expect(() => parseGithubRelease({
      ...base,
      assets: [
        { name: "board-central.uf2", browser_download_url: "https://example/central", size: 512 },
        { name: "board-peripheral.uf2", browser_download_url: "https://example/peripheral", size: 512, digest },
      ],
    }, profile)).toThrow("no SHA-256 digest");
  });

  it("falls back to a verified archive location", () => {
    const archived: FirmwareUpdateProfile = {
      ...profile,
      targets: [{
        ...profile.targets[0],
        locations: [
          { assetPattern: "^board-central\\.uf2$" },
          { assetPattern: "^firmware\\.zip$", archiveEntryPattern: "^board-central\\.uf2$" },
        ],
      }],
    };
    const release = parseGithubRelease({
      tag_name: "v1",
      name: "Firmware",
      published_at: "2026-09-14T00:00:00Z",
      target_commitish: "1234567",
      html_url: "https://example/release",
      assets: [{ name: "firmware.zip", browser_download_url: "https://example/zip", size: 2048, digest }],
    }, archived);
    expect(release.targets[0].asset.archiveEntryPattern).toBe("^board-central\\.uf2$");
  });

  it("compares full and abbreviated Git revisions", () => {
    expect(sameRevision("12345678", "1234567890abcdef")).toBe(true);
    expect(sameRevision("12345678", "abcdef0123456789")).toBe(false);
    expect(sameRevision("master", "master")).toBe(false);
  });
});
