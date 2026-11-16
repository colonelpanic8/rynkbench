// Layout properties → Firmware options: the keyboard-wide timings (combo,
// one-shot, tap intervals, the flow-tap window), as GLIDE keeps its firmware
// options in Layout properties. Written through the device draft (io.setBehavior).

import { useEffect, useRef, useState } from "react";
import type { BehaviorConfig } from "../../model/action-types";
import { useWorkbench } from "../state";
import { useDeviceDraft } from "../device-draft";
import { SaveBar, WriteStatus } from "../write-status";
import { TextInput } from "../kit";

/** The millisecond knobs this card edits. `BehaviorConfig` also carries the
 *  default morse profile, which is a struct and belongs to the morse editor. */
type TimingKey = {
  [K in keyof BehaviorConfig]: BehaviorConfig[K] extends number ? K : never;
}[keyof BehaviorConfig];

const FIELDS: Array<{
  key: TimingKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  {
    key: "combo_timeout_ms",
    label: "Combo timeout",
    hint: "How close together combo keys must land to count as a chord",
    min: 10,
    max: 500,
  },
  {
    key: "oneshot_timeout_ms",
    label: "One-shot timeout",
    hint: "How long a one-shot modifier or layer waits for the next key",
    min: 100,
    max: 10000,
  },
  {
    key: "tap_interval_ms",
    label: "Tap interval",
    hint: "Default window separating taps from holds",
    min: 50,
    max: 1000,
  },
  {
    key: "tap_capslock_interval_ms",
    label: "Caps Lock tap interval",
    hint: "Same window, but for Caps Lock (often set longer)",
    min: 50,
    max: 1000,
  },
  {
    key: "morse_prior_idle_time_ms",
    label: "Flow-tap window",
    hint: "A morse key pressed this soon after the previous key is forced to its tap action",
    min: 0,
    max: 1000,
  },
];

export function FirmwareOptions() {
  const { state, io } = useWorkbench();
  const saved = state.behavior;
  const pending = state.pending.behavior;
  const { draft, setDraft, dirty, reset } = useDeviceDraft(saved, pending?.status === "pending");
  const [justSaved, setJustSaved] = useState(false);

  // Flash "Saved" once the write settles.
  const wasPending = useRef(false);
  useEffect(() => {
    const fired = wasPending.current && !pending;
    wasPending.current = pending?.status === "pending";
    if (fired) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [pending]);

  if (!saved || !draft) {
    return <p className="text-body text-faint">This keyboard did not report its firmware options.</p>;
  }

  const writing = pending?.status === "pending";

  return (
    <div className="flex flex-col gap-4">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-ui text-ink">{f.label}</span>
            <span className="block text-small leading-snug text-faint">{f.hint}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <TextInput
              type="number"
              min={f.min}
              max={f.max}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
              className="w-24 text-right"
            />
            <span className="text-small text-faint">ms</span>
          </span>
        </label>
      ))}
      <WriteStatus id="behavior" onRetry={() => io.setBehavior(draft)} />
      <SaveBar
        className="flex items-center gap-2 border-t border-line-soft pt-4"
        dirty={dirty}
        writing={writing}
        saveLabel="Save timings"
        onSave={() => io.setBehavior({ ...draft })}
        onReset={reset}
      >
        <div className="flex-1" />
        {dirty && !writing && <span className="text-small text-warn">Unsaved changes</span>}
        {justSaved && !dirty && <span className="animate-pop text-small text-ok">Saved ✓</span>}
      </SaveBar>
    </div>
  );
}
