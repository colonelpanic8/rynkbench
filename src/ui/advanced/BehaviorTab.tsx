// Behavior: global timing configuration, one settings card.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BehaviorConfig } from "../../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "../state";
import { Button, Panel, SectionLabel, TextInput } from "../kit";
import { WarningIcon } from "../icons";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FIELDS: Array<{
  key: keyof BehaviorConfig;
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
];

export function BehaviorTab({ nav }: { nav: ReactNode }) {
  const { state, io } = useWorkbench();
  const saved = state.behavior;
  const [draft, setDraft] = useState<BehaviorConfig | null>(saved);
  const [justSaved, setJustSaved] = useState(false);

  // Follow device state while the draft is clean; flash "Saved" on write-ok.
  const savedRef = useRef(saved);
  const pending = state.pending.behavior;
  const wasPending = useRef(false);
  useEffect(() => {
    if (same(draft, savedRef.current)) setDraft(saved);
    savedRef.current = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
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
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {nav}
        <div className="mx-auto mt-8 max-w-xl text-center text-[12.5px] text-faint">
          This device did not report its behavior configuration.
        </div>
      </div>
    );
  }

  const dirty = !same(draft, saved);
  const writing = pending?.status === "pending";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {nav}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4 pb-8">
          <Panel className="p-5">
            <SectionLabel>Global timing</SectionLabel>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
              These apply keyboard-wide. Morse slots can override tap timings per key.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink">{f.label}</span>
                    <span className="block text-[11.5px] leading-snug text-faint">{f.hint}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <TextInput
                      type="number"
                      min={f.min}
                      max={f.max}
                      value={draft[f.key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [f.key]: Number(e.target.value) })
                      }
                      className="w-24 text-right"
                    />
                    <span className="text-[11.5px] text-faint">ms</span>
                  </span>
                </label>
              ))}
            </div>

            {pending?.status === "error" && (
              <div className="mt-4 flex items-center gap-2 text-[12px] text-danger">
                <WarningIcon size={13} />
                <span className="min-w-0 flex-1 truncate">Write failed: {pending.message}</span>
                <button
                  type="button"
                  className="cursor-pointer underline underline-offset-2"
                  onClick={() => io.setBehavior(draft)}
                >
                  Retry
                </button>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2 border-t border-line-soft pt-4">
              <Button
                variant="primary"
                disabled={!dirty || writing}
                onClick={() => io.setBehavior({ ...draft })}
              >
                {writing ? "Writing…" : "Save timings"}
              </Button>
              <Button
                variant="ghost"
                disabled={!dirty || writing}
                onClick={() => setDraft(saved)}
              >
                Reset
              </Button>
              <div className="flex-1" />
              {dirty && !writing && (
                <span className="text-[11.5px] text-warn">Unsaved changes</span>
              )}
              {justSaved && !dirty && (
                <span className="animate-pop text-[11.5px] text-ok">Saved to keyboard ✓</span>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
