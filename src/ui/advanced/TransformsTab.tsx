// Transforms: keymap-wide rewrites — the dual-OS Ctrl↔GUI swap and switching
// alpha layouts. Each is the apply_transform operation (ADR 0019): one change,
// one Undo step; in Draft it waits for Send, in Live it is sent at once.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TransformChoice } from "../../operations";
import { useWorkbench } from "../state";
import { Button, Chip, Panel, SectionLabel } from "../kit";
import { CenterScroll } from "./bits";
import { layerName as nameOfLayer } from "../layer-names";
import {
  planLayoutSwitch,
  planOsSwap,
  planKeyCount,
  planSize,
  type AlphaLayout,
  type LayerMigration,
  type TransformPlan,
} from "../../model/transforms";

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
  | { phase: "running" }
  | { phase: "done"; changes: number; drafted: boolean }
  | { phase: "error"; message: string };

export function TransformsTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, io } = useWorkbench();
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
      macroOps: state.macroOps,
    }),
    [
      state.layers,
      bundle.caps.num_cols,
      state.combos,
      state.morse,
      state.forks,
      state.macroOps,
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

  const execute = async (choice: TransformChoice, plan: TransformPlan) => {
    const changes = planSize(plan);
    if (changes === 0 || busy) return;
    setRun({ phase: "running" });
    const result = await io.apply("apply_transform", choice);
    if (result.ok) setRun({ phase: "done", changes, drafted: state.batchMode });
    else setRun(result.guarded ? { phase: "idle" } : { phase: "error", message: result.message });
  };

  /** The chip aggregates key cells with slot-table and macro-region writes;
   *  spell the split out rather than leaving one number to explain both. */
  const planBreakdown = (plan: TransformPlan): string => {
    const keys = planKeyCount(plan);
    const tables = planSize(plan) - keys;
    return `${keys} key binding${keys === 1 ? "" : "s"}, ${tables} combo/morse/fork/macro write${tables === 1 ? "" : "s"}`;
  };

  const layerName = (layer: number): string => nameOfLayer(state.layerMetadata, layer);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {nav}
      <CenterScroll>
        <Panel className="p-5">
          <SectionLabel>Swap Ctrl ↔ GUI</SectionLabel>
          <p className="mt-1.5 text-body leading-relaxed text-faint">
            Converts a PC-style keymap to its macOS counterpart (and back — the swap is
            its own inverse). Rewrites every binding that names Ctrl or GUI: keys on all
            layers, combos, morse slots, forks, and macro steps. One step to undo.
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={busy || planSize(osPlan) === 0}
              onClick={() => execute({ transform: "ctrl-gui-swap" }, osPlan)}
            >
              Swap everywhere
            </Button>
            <span title={planBreakdown(osPlan)}>
              <Chip tone={planSize(osPlan) === 0 ? "neutral" : "accent"}>
                {planSize(osPlan)} {planSize(osPlan) === 1 ? "change" : "changes"}
              </Chip>
            </span>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionLabel>Switch alpha layout</SectionLabel>
          <p className="mt-1.5 text-body leading-relaxed text-faint">
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
              <span className="w-10 text-small uppercase tracking-wide text-faint">
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
                <span className="w-40 truncate text-body text-mute">
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
                          ? "cursor-pointer rounded-md bg-accent/15 px-2 py-0.5 text-small font-medium text-accent"
                          : "cursor-pointer rounded-md px-2 py-0.5 text-small text-faint hover:text-mute"
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
              onClick={() => execute({ transform: "alpha-layout", from, to, migrations }, layoutPlan)}
            >
              Switch {LAYOUTS.find((entry) => entry.id === from)?.label} →{" "}
              {LAYOUTS.find((entry) => entry.id === to)?.label}
            </Button>
            <span title={planBreakdown(layoutPlan)}>
              <Chip tone={planSize(layoutPlan) === 0 ? "neutral" : "accent"}>
                {planSize(layoutPlan)} {planSize(layoutPlan) === 1 ? "change" : "changes"}
              </Chip>
            </span>
          </div>
        </Panel>

        {run.phase === "running" && <div className="text-center text-body text-accent">Writing…</div>}
        {run.phase === "done" && (
          <div className="text-center text-body text-ok">
            {run.drafted
              ? `${run.changes} ${run.changes === 1 ? "change" : "changes"} in the draft.`
              : `Wrote ${run.changes} ${run.changes === 1 ? "change" : "changes"} to the keyboard.`}
          </div>
        )}
        {run.phase === "error" && (
          <div className="text-center text-body text-danger">Transform failed: {run.message}</div>
        )}
      </CenterScroll>
    </div>
  );
}
