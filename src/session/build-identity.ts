/**
 * Which sources this client and the connected firmware were built from.
 *
 * Neither version number the protocol exposes can answer that question.
 * `ProtocolVersion` is minted upstream and frozen at v0.1 — downstream forks
 * are forbidden from bumping it — and `DeviceInfo.rmk_version` is RMK's semver,
 * which does not move when the fork changes an encoding. So two builds that
 * disagree about, say, the keycode table report identical versions right up to
 * the point where one fails to decode what the other wrote.
 *
 * What does identify a build is its source revision. The firmware reports its
 * own in the application-defined `GetBuildInfo` label; this client's are
 * recorded by the flake into each vendored wasm package. Comparing them will
 * not prove compatibility, but it makes a mismatch visible, which is the
 * difference between a mystifying decode failure and an obvious one.
 */
import configRev from "../vendor/moergo-config-wasm/build-rev.json";
import rynkRev from "../vendor/rynk-wasm/build-rev.json";

/** A source pin recorded by the flake when it built a wasm package. */
export interface PinnedRev {
  /** Flake input name, e.g. `rmk` or `moergo-rmk`. */
  input: string;
  /** Full commit the input resolved to. */
  rev: string;
}

/** The revisions this client speaks. */
export const CLIENT_REVS: PinnedRev[] = [rynkRev, configRev];

/** Firmware build identity parsed out of a `GetBuildInfo` label. */
export interface FirmwareBuild {
  /** Downstream configuration commit, when the label names one. */
  config?: string;
  /** Board package name and semver, e.g. `glove80-rmk` / `0.1.0`. */
  app?: string;
  appVersion?: string;
  /** Application source commit. */
  appRev?: string;
  /** Whether the firmware was built from a dirty tree. */
  dirty: boolean;
  /** RMK's `git describe` identity, e.g. `rmk-v0.8.2-837-g566cbcf9`. */
  rmk?: string;
}

/**
 * Read a firmware build label.
 *
 * The label is deliberately application-defined, so this recognizes the shape
 * moergo-rmk emits and degrades to `{}` for anything else rather than
 * inventing structure. Callers must still show the raw label.
 */
export function parseBuildLabel(label: string): FirmwareBuild {
  const build: FirmwareBuild = { dirty: label.includes("-dirty") };

  const config = /config ([0-9a-f]+)/.exec(label);
  if (config) build.config = config[1];

  const app = /([A-Za-z0-9_-]+) v(\S+) \(([0-9a-f]+)/.exec(label);
  if (app) {
    build.app = app[1];
    build.appVersion = app[2];
    build.appRev = app[3];
  }

  const rmk = /RMK (\S+)/.exec(label);
  if (rmk) build.rmk = rmk[1];

  return build;
}

/** Whether a revision the firmware named is the one this client was built on. */
function namesSameCommit(firmware: string, pinned: string): boolean {
  // The firmware abbreviates its own commit to eight characters, and reports
  // RMK's as the `g<sha>` suffix of a `git describe`. Both are prefixes of the
  // full revision the flake pinned.
  const sha = /g([0-9a-f]{7,})$/.exec(firmware)?.[1] ?? firmware;
  return sha.length >= 7 && pinned.startsWith(sha);
}

export type RevAgreement = "same" | "different" | "unknown";

/**
 * Compare a firmware build against this client's pins.
 *
 * `unknown` when the label does not name a revision to compare — an older or
 * differently-branded firmware — which is not a mismatch and must not be
 * reported as one.
 */
export function compareRevs(build: FirmwareBuild): {
  app: RevAgreement;
  rmk: RevAgreement;
} {
  const pin = (input: string) => CLIENT_REVS.find((r) => r.input === input)?.rev;
  const agree = (firmware: string | undefined, pinned: string | undefined): RevAgreement => {
    if (!firmware || !pinned) return "unknown";
    return namesSameCommit(firmware, pinned) ? "same" : "different";
  };
  return {
    app: agree(build.appRev, pin("moergo-rmk")),
    rmk: agree(build.rmk, pin("rmk")),
  };
}

/** True when the firmware and this client demonstrably disagree about a pin. */
export function revsDiverge(build: FirmwareBuild): boolean {
  const cmp = compareRevs(build);
  return cmp.app === "different" || cmp.rmk === "different";
}
