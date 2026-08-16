// Transforms: keymap-wide rewrites applied live through the ordinary write
// path — the dual-OS Ctrl↔GUI swap and QWERTY→alternate alpha layouts.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useWorkbench } from "../state";
import { Button, Chip, Panel, SectionLabel } from "../kit";
import { CenterScroll } from "./bits";
import {
  planAlphaRemap,
  planOsSwap,
  planSize,
  type AlphaLayout,
  type TransformPlan,
} from "./transforms";

const LAYOUTS: Array<{ id: AlphaLayout; label: string }> = [
  { id: "colemak", label: "Colemak" },
  { id: "colemak-dh", label: "Colemak-DH" },
  { id: "dvorak", label: "Dvorak" },
];

type RunState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; written: number; failed: number }
  | { phase: "error"; message: string };

export function TransformsTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, dispatch, io, history } = useWorkbench();
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [layout, setLayout] = useState<AlphaLayout>("colemak");
  const [targetLayers, setTargetLayers] = useState<number[]>([state.defaultLayer]);

  const input = useMemo(
    () => ({
      layers: state.layers,
      cols: bundle.caps.num_cols,
      combos: state.combos,
      morse: state.morse,
      forks: state.forks,
      macroBytes: state.macroBytes,
    }),
    [
      state.layers,
      bundle.caps.num_cols,
      state.combos,
      state.morse,
      state.forks,
      state.macroBytes,
    ],
  );

  const osPlan = useMemo(() => planOsSwap(input), [input]);
  const alphaPlan = useMemo(
    () => planAlphaRemap(input, layout, targetLayers),
    [input, layout, targetLayers],
  );

  const busy = run.phase === "running";

  const execute = async (plan: TransformPlan) => {
    const total = planSize(plan);
    if (total === 0 || busy) return;
    dispatch({ type: "keyHistorySuspend", suspended: true });
    history.clear();
    let done = 0;
    let failed = 0;
    setRun({ phase: "running", done, total });
    try {
      for (const edit of plan.keys) {
        const result = await io.setKey(edit.layer, edit.row, edit.col, edit.after, {
          history: "invalidate",
        });
        if (!result.ok) failed += 1;
        done += 1;
        setRun({ phase: "running", done, total });
      }
      for (const edit of plan.combos) io.setSlot("combos", edit.index, edit.after);
      for (const edit of plan.morse) io.setSlot("morse", edit.index, edit.after);
      for (const edit of plan.forks) io.setSlot("forks", edit.index, edit.after);
      if (plan.macroBytes) io.writeMacros(plan.macroBytes);
      setRun({ phase: "done", written: total - failed, failed });
    } catch (err) {
      setRun({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      history.clear();
      dispatch({ type: "keyHistorySuspend", suspended: false });
    }
  };

  const layerName = (layer: number): string =>
    state.layerMetadata?.[layer]?.name || `Layer ${layer}`;
  const toggleLayer = (layer: number) =>
    setTargetLayers((current) =>
      current.includes(layer)
        ? current.filter((l) => l !== layer)
        : [...current, layer].sort((a, b) => a - b),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {nav}
      <CenterScroll>
        <Panel className="p-5">
          <SectionLabel>Swap Ctrl ↔ GUI</SectionLabel>
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Converts a PC-style keymap to its macOS counterpart (and back — the swap is
            its own inverse). Rewrites every binding that names Ctrl or GUI: keys on all
            layers, combos, morse slots, forks, and macro steps. Changes are written to
            the keyboard immediately; export a file first if you want both variants.
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={busy || planSize(osPlan) === 0}
              onClick={() => execute(osPlan)}
            >
              Swap everywhere
            </Button>
            <Chip tone={planSize(osPlan) === 0 ? "neutral" : "accent"}>
              {planSize(osPlan)} {planSize(osPlan) === 1 ? "change" : "changes"}
            </Chip>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionLabel>Alpha layout</SectionLabel>
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Remaps QWERTY alphas (and, for Dvorak, punctuation) to another layout on the
            layers you pick. Tap-hold and layer-tap keys keep their holds while the tap
            letter moves. Leave positional layers — gaming WASD — unchecked. Combos match
            by action, so they follow the letters automatically.
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {LAYOUTS.map((entry) => (
              <Button
                key={entry.id}
                variant={entry.id === layout ? "primary" : "outline"}
                onClick={() => setLayout(entry.id)}
                disabled={busy}
              >
                {entry.label}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {state.layers.map((_, layer) => (
              <label
                key={layer}
                className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-mute"
              >
                <input
                  type="checkbox"
                  checked={targetLayers.includes(layer)}
                  onChange={() => toggleLayer(layer)}
                  disabled={busy}
                />
                {layerName(layer)}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={busy || planSize(alphaPlan) === 0}
              onClick={() => execute(alphaPlan)}
            >
              Apply {LAYOUTS.find((entry) => entry.id === layout)?.label}
            </Button>
            <Chip tone={planSize(alphaPlan) === 0 ? "neutral" : "accent"}>
              {planSize(alphaPlan)} {planSize(alphaPlan) === 1 ? "key" : "keys"}
            </Chip>
          </div>
        </Panel>

        {run.phase === "running" && (
          <div className="text-center text-[12.5px] text-accent">
            Writing {run.done}/{run.total}…
          </div>
        )}
        {run.phase === "done" && (
          <div className={run.failed ? "text-center text-[12.5px] text-warn" : "text-center text-[12.5px] text-ok"}>
            {run.failed
              ? `Wrote ${run.written} changes; ${run.failed} failed — see the key inspector.`
              : `Wrote ${run.written} ${run.written === 1 ? "change" : "changes"} to the keyboard.`}
          </div>
        )}
        {run.phase === "error" && (
          <div className="text-center text-[12.5px] text-danger">Transform failed: {run.message}</div>
        )}
      </CenterScroll>
    </div>
  );
}
