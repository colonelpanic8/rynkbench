// Source revisions this client and the firmware were each built from.

import type { BuildInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { RevAgreement } from "../../session/build-identity";
import {
  CLIENT_REVS,
  compareRevs,
  parseBuildLabel,
  revsDiverge,
} from "../../session/build-identity";
import { Panel, Row, SectionLabel } from "../kit";

/**
 * What this client and the firmware were each built from.
 *
 * Neither version above answers that: the Rynk protocol version is frozen at
 * v0.1 upstream, and RMK's semver does not move when the fork changes an
 * encoding — so two builds that disagree about, say, the keycode table report
 * identical versions right until one fails to decode what the other wrote. The
 * source revisions do distinguish them, so they are shown plainly, and a
 * divergence is marked rather than announced: the assembled branch is rebuilt on
 * every repin, so a mismatch is common and a banner would only teach you to
 * ignore it.
 */
export function BuildCard({ build }: { build: BuildInfo | null }) {
  const parsed = build ? parseBuildLabel(build.label) : null;
  const agreement = parsed ? compareRevs(parsed) : null;

  const mark = (state: RevAgreement) =>
    state === "different" ? <span className="ml-1.5 text-warn">≠</span> : null;

  return (
    <Panel className="col-span-2 p-4">
      <SectionLabel>Build</SectionLabel>
      <div className="mt-2 flex flex-col divide-y divide-line-soft">
        <Row label="Firmware" mono>
          {build ? build.label : "not reported"}
        </Row>
        {CLIENT_REVS.map((pin) => (
          <Row key={pin.input} label={`This client · ${pin.input}`} mono>
            {pin.rev.slice(0, 8)}
            {agreement && mark(pin.input === "rmk" ? agreement.rmk : agreement.app)}
          </Row>
        ))}
      </div>
      {parsed && revsDiverge(parsed) && (
        <div className="mt-2 text-[11px] leading-relaxed text-faint">
          Marked revisions differ from the firmware's. Usually harmless, but it is
          the first thing to check if a read fails to decode.
        </div>
      )}
      {parsed?.dirty && (
        <div className="mt-2 text-[11px] leading-relaxed text-faint">
          The firmware was built from a modified tree, so its revision does not
          fully identify it.
        </div>
      )}
    </Panel>
  );
}

