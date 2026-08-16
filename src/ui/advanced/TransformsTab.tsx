// Transforms: keymap-wide rewrites applied live through the ordinary write
// path — the dual-OS Ctrl↔GUI swap and QWERTY→alternate alpha layouts.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useWorkbench } from "../state";
import { Button, Chip, Panel, SectionLabel } from "../kit";
import { CenterScroll } from "./bits";
import {
  planLayoutSwitch,
  planOsSwap,
  planSize,
  type AlphaLayout,
  type LayerMigration,
  type TransformPlan,
} from "./transforms";

const LAYOUTS: Array<{ id: AlphaLayout; label: string }> = [
  { id: "qwerty", label: "QWERTY" },
  { id: "colemak", label: "Colemak" },
  { id: "colemak-dh", label: "Colemak-DH" },
  { id: "dvorak", label: "Dvorak" },
];

const MIGRATIONS: Array<{ id: LayerMigration; label: string; hint: string }> = [
  { id: "positional", label: "Positional", hint: "leave the layer untouched" },
  { id: "alphas", label: "Alphas", hint: "substitute the letter keycodes in place" },
  { id: "mnemonic", label: "Mnemonic", hint: "move bindings so they stay on the same letter" },
];

type RunState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; written: number; failed: number }
  | { phase: "error"; message: string };

export function TransformsTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, dispatch, io, history } = useWorkbench();
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [from, setFrom] = useState<AlphaLayout>("qwerty");
  const [to, setTo] = useState<AlphaLayout>("colemak");
  const [migrationOverrides, setMigrationOverrides] = useState<
    Record<number, LayerMigration>
  >({});

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
  const migrations = useMemo(
    () =>
      state.layers.map(
        (_, layer) =>
          migrationOverrides[layer] ??
          (layer === state.defaultLayer ? "alphas" : "positional"),
      ),
    [state.layers, migrationOverrides, state.defaultLayer],
  );
  const layoutPlan = useMemo(
    () => planLayoutSwitch(input, from, to, migrations, state.defaultLayer),
    [input, from, to, migrations, state.defaultLayer],
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
          <SectionLabel>Switch alpha layout</SectionLabel>
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Converts between alpha layouts in either direction — tell it what the keymap
            is now and what it should become. Each layer migrates its own way:{" "}
            <span className="text-mute">alphas</span> substitutes the letter keycodes in
            place (tap-holds keep their holds while the tap letter changes),{" "}
            <span className="text-mute">mnemonic</span> moves whole bindings so they stay
            on the same letter (a shortcut on C follows C to its new position), and{" "}
            <span className="text-mute">positional</span> leaves the layer untouched —
            right for gaming WASD and symbol layers. Combos match by action, so they
            follow the letters automatically.
          </p>
          {(["from", "to"] as const).map((which) => (
            <div key={which} className="mt-3 flex items-center gap-1.5">
              <span className="w-10 text-[11.5px] uppercase tracking-wide text-faint">
                {which}
              </span>
              {LAYOUTS.map((entry) => (
                <Button
                  key={entry.id}
                  variant={
                    entry.id === (which === "from" ? from : to) ? "primary" : "outline"
                  }
                  onClick={() => (which === "from" ? setFrom(entry.id) : setTo(entry.id))}
                  disabled={busy}
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          ))}
          <div className="mt-4 flex flex-col gap-1.5">
            {state.layers.map((_, layer) => (
              <div key={layer} className="flex items-center gap-2">
                <span className="w-40 truncate text-[12.5px] text-mute">
                  {layerName(layer)}
                  {layer === state.defaultLayer && (
                    <span className="text-faint"> · default</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {MIGRATIONS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.hint}
                      disabled={busy}
                      onClick={() =>
                        setMigrationOverrides((current) => ({
                          ...current,
                          [layer]: entry.id,
                        }))
                      }
                      className={
                        migrations[layer] === entry.id
                          ? "cursor-pointer rounded-md bg-accent/15 px-2 py-0.5 text-[11.5px] font-medium text-accent"
                          : "cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] text-faint hover:text-mute"
                      }
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={busy || from === to || planSize(layoutPlan) === 0}
              onClick={() => execute(layoutPlan)}
            >
              Switch {LAYOUTS.find((entry) => entry.id === from)?.label} →{" "}
              {LAYOUTS.find((entry) => entry.id === to)?.label}
            </Button>
            <Chip tone={planSize(layoutPlan) === 0 ? "neutral" : "accent"}>
              {planSize(layoutPlan)} {planSize(layoutPlan) === 1 ? "key" : "keys"}
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
