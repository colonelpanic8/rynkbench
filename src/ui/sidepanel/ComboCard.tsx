// One combo in the side panel, as in GLIDE: its number and action, then (as a
// card) a small keyboard with its keys marked and the layers it works on, or
// (as a list row) how many keys it has. A warning says what it lacks.

import type { ReactNode } from "react";
import type { ComboDefinition, KeyAction } from "../../model/action-types";
import { comboHasKey, comboLayer, comboNeeds, comboOutput, comboTriggerCount } from "../../model/combos";
import { MiniBoard } from "../canvas/MiniBoard";

import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import { cx } from "../kit";
import { MoreIcon, WarningIcon } from "../icons";
import { useKeyText } from "../useKeyText";

function warningOf(combo: ComboDefinition, twins: number): string | null {
  const needs = comboNeeds(combo);
  if (needs === "action") return "No action";
  if (needs === "keys") return "Needs another key";
  return twins > 0 ? "Duplicate keys" : null;
}

function LayerChip({ children }: { children: ReactNode }) {
  return <span className="rounded border border-line-strong px-1.5 py-px text-caption font-semibold text-mute">{children}</span>;
}

export function ComboCard({
  index,
  combo,
  twins,
  view,
  open,
  menuOpen,
  onOpen,
  onMenu,
  rowProps,
}: {
  index: number;
  combo: ComboDefinition;
  twins: number;
  view: "cards" | "list";
  open: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (event: React.MouseEvent<HTMLElement>) => void;
  rowProps: object;
}) {
  const keyText = useKeyText();
  const { bundle, state } = useWorkbench();
  const layer = comboLayer(combo);
  const warning = warningOf(combo, twins);
  const action = keyText.glyph(comboOutput(combo)).text || "No action";
  // A combo of actions is matched on its own layer, else the default one.
  const actions = state.layers[layer ?? state.defaultLayer] ?? [];
  const actionAt = (row: number, col: number): KeyAction => actions[row * bundle.caps.num_cols + col] ?? "No";

  return (
    <div
      {...rowProps}
      data-testid="combo-row"
      className={cx(
        "group relative flex flex-col gap-2 rounded-xl border p-2 transition-all duration-200",
        open
          ? "border-accent bg-raised shadow-sm"
          : menuOpen
            ? "border-line-strong bg-panel"
            : "border-transparent hover:border-line-strong hover:bg-panel",
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-current={open ? "true" : undefined}
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 pl-1 text-left"
        >
          <span
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-caption",
              open ? "border-accent bg-accent-fill text-on-accent" : "border-line-strong text-mute",
            )}
          >
            C{index}
          </span>
          <span className={cx("min-w-0 flex-1 truncate text-body font-semibold", open ? "text-accent" : "text-ink")}>
            {action}
          </span>
          {view === "list" && <span className="shrink-0 text-small text-faint">{comboTriggerCount(combo)} keys</span>}
        </button>
        <button
          type="button"
          aria-label={`Actions for combo C${index}`}
          title="Combo actions (or right-click the combo)"
          onClick={onMenu}
          className={cx(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-mute transition-[opacity,visibility] hover:bg-hover hover:text-ink",
            open || menuOpen ? "opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
          )}
        >
          <MoreIcon size={15} />
        </button>
      </div>
      {view === "cards" && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onOpen}
          className="h-16 cursor-pointer rounded-lg border border-line bg-well px-3 py-2"
        >
          <MiniBoard model={bundle.model} marked={(key) => comboHasKey(combo, key, actionAt(key.row, key.col))} />
        </button>
      )}
      {(view === "cards" || warning) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          {view === "cards" && (
            <LayerChip>{layer === undefined ? "All Layers" : layerName(state.layerMetadata, layer)}</LayerChip>
          )}
          {warning && (
            <span className="flex items-center gap-1 text-small font-semibold text-warn">
              <WarningIcon size={11} /> {warning}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
