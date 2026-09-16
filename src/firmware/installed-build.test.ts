// What the firmware panel says about the build a board is actually running.

import { describe, expect, it } from "vitest";
import { glove80Board } from "../session/mock/glove80";
import { mockProvider } from "../session/mock/board";
import { describeBuild, parseBuildLabel } from "../session/build-identity";
import { openBundle } from "../ui/bundle";
import {
  firmwareUpdateStatus,
  parseGithubRelease,
  type FirmwareRelease,
} from "./releases";
import { MOERGO_PROFILES } from "../model/boards/profiles/moergo";

const CONFIG_REV = "35372ac0c260a7d366b2a44ddb0f9e1b6c724663";
const digest = `sha256:${"a".repeat(64)}`;

const glove80 = MOERGO_PROFILES.find((board) => board.id === "glove80")!;

const release = (): FirmwareRelease => parseGithubRelease({
  tag_name: "v2026.09.15.5",
  name: "MoErgo firmware 2026.09.15.5",
  published_at: "2026-09-15T23:43:55Z",
  target_commitish: CONFIG_REV,
  html_url: "https://github.com/colonelpanic8/moergo-config/releases/tag/v2026.09.15.5",
  assets: [
    { name: "glove80-rmk-0.1.0-lh.uf2", browser_download_url: "https://example/lh", size: 512, digest },
    { name: "glove80-rmk-0.1.0-rh.uf2", browser_download_url: "https://example/rh", size: 512, digest },
  ],
}, glove80.firmware!);

/** What the panel reads off a board running `label`. */
async function panel(label: string) {
  const session = await mockProvider({ ...glove80Board, build: { label } }).connect();
  try {
    const bundle = await openBundle(session);
    const installed = bundle.build ? parseBuildLabel(bundle.build.label) : null;
    return {
      shows: (installed && describeBuild(installed)) ?? "unknown",
      status: firmwareUpdateStatus(installed, release()),
    };
  } finally {
    await session.close();
  }
}

describe("installed firmware identity", () => {
  it("names a build that carries no configuration commit", async () => {
    // moergo-rmk writes `config standalone` whenever it is built outside a
    // configuration repository, which is most of the ways a Glove80 image is
    // produced. The label still names the exact application build.
    await expect(
      panel("config standalone / glove80-rmk v0.1.0 (8ad2f764) / RMK a17194d5"),
    ).resolves.toEqual({ shows: "glove80-rmk 0.1.0 (8ad2f764)", status: "unidentified" });
  });

  it("offers no update for a build it cannot place in the channel", async () => {
    await expect(panel("RMK v0.9.0")).resolves.toEqual({
      shows: "unknown",
      status: "unidentified",
    });
  });

  it("recognizes the release it was flashed from", async () => {
    await expect(
      panel(`config ${CONFIG_REV.slice(0, 8)} / glove80-rmk v0.1.0 (8ad2f764) / RMK a17194d5`),
    ).resolves.toEqual({ shows: "35372ac0", status: "current" });
  });

  it("still offers the update an older release build is owed", async () => {
    await expect(
      panel("config 6b6cdf8c / glove80-rmk v0.1.0 (fddd2c78) / RMK 4553d05b"),
    ).resolves.toEqual({ shows: "6b6cdf8c", status: "outdated" });
  });

  it("decides nothing from a modified tree, whatever commit it names", async () => {
    await expect(
      panel(`config ${CONFIG_REV.slice(0, 8)}-dirty / glove80-rmk v0.1.0 (8ad2f764) / RMK a17194d5`),
    ).resolves.toEqual({ shows: "35372ac0", status: "unidentified" });
  });
});
