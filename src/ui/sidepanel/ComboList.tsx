// The side panel's combo list, as in GLIDE: Create Combo, a search and a
// layer filter, then the combos as cards (a small keyboard with their keys)
// or as a list. Clicking one (or Create) opens it in Focus Mode; its ⋮ menu
// edits or deletes it.

import { useState, useSyncExternalStore } from "react";
import { comboIsEmpty, comboLayer, comboOutput, comboTriggerCount, comboTwins } from "../../model/combos";
import { emptyCombo } from "../../model/slots";

import { layerName } from "../layer-names";
import { showToast } from "../messages/store";
import { createSetting, SETTING_KEYS } from "../settings";
import { useWorkbench } from "../state";
import { useTerms } from "../terms";
import { Button, cx, TextInput } from "../kit";
import { PlusIcon } from "../icons";
import { RowMenu, useRowMenu } from "../RowMenu";
import { ComboCard } from "./ComboCard";
import { useKeyText } from "../useKeyText";

type View = "cards" | "list";
const comboView = createSetting<View>(SETTING_KEYS.comboView, (raw) => (raw === "list" ? "list" : "cards"));

function ViewSwitch({ value }: { value: View }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-line p-0.5">
      {(["cards", "list"] as const).map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => comboView.set(view)}
          className={cx(
            "cursor-pointer rounded-md px-2.5 py-1 text-small font-semibold capitalize transition-colors",
            value === view ? "bg-raised text-accent" : "text-mute hover:text-ink",
          )}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

export function ComboList() {
  const keyText = useKeyText();
  const { bundle, state, dispatch, io } = useWorkbench();
  const term = useTerms();
  const menu = useRowMenu<number>();
  const view = useSyncExternalStore(comboView.subscribe, comboView.get, comboView.get);
  const [query, setQuery] = useState("");
  const [layerFilter, setLayerFilter] = useState<number | null>(null);
  const capacity = bundle.caps.max_combos;
  const editing = state.selection?.type === "combo" ? state.selection.index : null;
  const used = state.combos.filter((combo) => !comboIsEmpty(combo)).length;
  const free = state.combos.findIndex(comboIsEmpty);
  const needle = query.trim().toLowerCase();
  const rows = state.combos
    .map((combo, index) => ({ combo, index }))
    .filter(({ combo, index }) => comboTriggerCount(combo) > 0 || index === editing)
    .filter(({ combo }) => {
      const layer = comboLayer(combo);
      return layerFilter === null || layer === undefined || layer === layerFilter;
    })
    .filter(
      ({ combo, index }) =>
        !needle || `c${index} ${keyText.describe(comboOutput(combo))}`.toLowerCase().includes(needle),
    );
  const focus = (index: number) => dispatch({ type: "select", selection: { type: "combo", index } });

  const remove = (index: number) => {
    const before = state.combos[index];
    if (!before) return;
    if (editing === index) dispatch({ type: "select", selection: null });
    void io.setSlot("combos", index, emptyCombo());
    showToast(`Combo C${index} deleted`, { action: { label: "Undo", run: () => void io.setSlot("combos", index, before) } });
  };

  if (capacity === 0) {
    return <p className="px-1 text-small leading-relaxed text-faint">This keyboard has no combos.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => focus(free)}
        disabled={free === -1}
        reason={`All ${capacity} combos are in use: delete one first`}
        className="w-full border-dashed border-line-strong py-2.5 font-semibold text-mute hover:text-ink"
      >
        <PlusIcon size={12} /> Create {term("section.combos").toLowerCase().replace(/s$/, "")}
      </Button>
      {used > 0 && (
        <>
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by action or number (C3)"
            aria-label="Search combos"
          />
          <div className="flex gap-2">
            <select
              value={layerFilter ?? ""}
              onChange={(event) => setLayerFilter(event.target.value === "" ? null : Number(event.target.value))}
              aria-label="Show combos on"
              className="min-w-0 flex-1 rounded-lg border border-line bg-well px-2 py-1.5 text-body text-ink"
            >
              <option value="">All Layers</option>
              {Array.from({ length: bundle.caps.num_layers }, (_, layer) => (
                <option key={layer} value={layer}>
                  {layerName(state.layerMetadata, layer)}
                </option>
              ))}
            </select>
            <ViewSwitch value={view} />
          </div>
        </>
      )}
      {used === 0 && editing === null && (
        <p className="px-1 pt-2 text-small leading-relaxed text-faint">
          No combos yet. A combo does something when several keys are pressed together.
        </p>
      )}
      {used > 0 && rows.length === 0 && <p className="px-1 pt-2 text-small text-faint">No combos match.</p>}
      {rows.map(({ combo, index }) => (
        <ComboCard
          key={index}
          index={index}
          combo={combo}
          twins={comboTwins(state.combos, index).length}
          view={view}
          open={editing === index}
          menuOpen={menu.openFor === index}
          onOpen={() => focus(index)}
          onMenu={(event) => menu.openFrom(event, index)}
          rowProps={menu.rowProps(index)}
        />
      ))}
      {menu.at && (
        <RowMenu
          x={menu.at.x}
          y={menu.at.y}
          label={`Combo C${menu.at.id}`}
          items={[{ id: "edit", label: "Edit on the keyboard" }, "-", { id: "delete", label: "Delete", danger: true }]}
          onAction={(id) => {
            if (!menu.at) return;
            if (id === "edit") focus(menu.at.id);
            else if (id === "delete") remove(menu.at.id);
          }}
          onClose={menu.close}
        />
      )}
      <p className="px-1 pt-1 text-caption text-faint">
        {used} of {capacity} used
      </p>
    </div>
  );
}
