// Combos: trigger keys are captured by clicking keys on the board canvas;
// the output is picked with the standard action editor.

import { useState } from "react";
import type { ReactNode } from "react";
import type { Combo, KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph } from "../labels";
import { ActionEditor, SlotPicker } from "../keymap/ActionEditor";
import { slotPendingId, useWorkbench } from "../state";
import { Button, Chip, InspectorShell, SectionLabel, cx } from "../kit";
import { CloseIcon, PlusIcon, TrashIcon } from "../icons";
import { SlotStatus, comboIsEmpty } from "./bits";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function TriggerChip({ action, onRemove }: { action: KeyAction; onRemove: () => void }) {
  const glyph = keyActionGlyph(action);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-cap-edge bg-cap px-2 py-1 font-mono text-[12.5px] text-cap-ink">
      {glyph.text || "·"}
      <button
        type="button"
        title="Remove trigger key"
        onClick={onRemove}
        className="cursor-pointer text-faint transition-colors duration-120 hover:text-danger"
      >
        <CloseIcon size={10} />
      </button>
    </span>
  );
}

export function CombosTab({
  nav,
  goBehavior,
}: {
  nav: ReactNode;
  goBehavior: () => void;
}) {
  const { bundle, state, io } = useWorkbench();
  const caps = bundle.caps;
  const cols = caps.num_cols;

  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<Combo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const editing = sel !== null && draft !== null;
  const saved = sel !== null ? state.combos[sel] : null;
  const dirty = editing && !same(draft, saved);
  const pending = sel !== null && state.pending[slotPendingId("combos", sel)]?.status === "pending";

  const open = (index: number) => {
    setSel(index);
    setDraft(JSON.parse(JSON.stringify(state.combos[index])) as Combo);
    setPickerOpen(false);
  };

  const close = () => {
    setSel(null);
    setDraft(null);
  };

  const addNew = () => {
    const free = state.combos.findIndex(comboIsEmpty);
    if (free === -1) return;
    setSel(free);
    setDraft({ actions: [], output: "No", layer: undefined });
    setPickerOpen(false);
  };

  const nonEmpty = state.combos
    .map((combo, index) => ({ combo, index }))
    .filter(({ combo, index }) => !comboIsEmpty(combo) || index === sel);
  const hasFree = state.combos.some(comboIsEmpty);

  // Trigger capture reads actions from the combo's scoped layer, else the
  // default layer — that is the keymap the chord will be matched against.
  const captureLayer = draft?.layer ?? state.defaultLayer;
  const layerActions = state.layers[captureLayer];

  const toggleTrigger = (action: KeyAction) => {
    if (!draft) return;
    if (action === "No" || action === "Transparent") return;
    const at = draft.actions.findIndex((a) => same(a, action));
    if (at >= 0) {
      setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== at) });
    } else if (draft.actions.length < caps.max_combo_keys) {
      setDraft({ ...draft, actions: [...draft.actions, action] });
    }
  };

  const decorFor = (key: KeyView): KeyDecor => {
    const action = layerActions?.[key.row * cols + key.col];
    const glyph = action !== undefined ? keyActionGlyph(action) : { text: "" };
    if (!glyph.text && key.label) {
      glyph.text = key.label;
      glyph.dim = true;
    }
    const isTrigger =
      editing && action !== undefined && draft.actions.some((a) => same(a, action));
    return {
      glyph,
      inSelection: isTrigger,
      disabled: editing && (action === "No" || action === "Transparent"),
    };
  };

  const full = editing && draft.actions.length >= caps.max_combo_keys;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
        {nav}
        <div className="flex items-center gap-3 px-1">
          {editing ? (
            <>
              <span className="text-[12.5px] text-mute">
                Click keys to add them to the chord
              </span>
              <Chip tone={full ? "accent" : "neutral"} className="tnum">
                {draft.actions.length} / {caps.max_combo_keys} keys
              </Chip>
              <span className="tnum text-[11.5px] text-faint">
                capturing from layer {captureLayer}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] text-faint">
              Select a combo — or add one — to capture its trigger keys on the board.
            </span>
          )}
        </div>
        <BoardWell model={bundle.model}>
          <KeyboardCanvas
            model={bundle.model}
            className="h-full w-full"
            interactive={editing}
            decorFor={decorFor}
            onKeyPointerDown={(key) => {
              const action = layerActions?.[key.row * cols + key.col];
              if (action !== undefined) toggleTrigger(action);
            }}
          />
        </BoardWell>
      </div>

      <InspectorShell>
        <div className="flex items-center justify-between">
          <SectionLabel>Combos</SectionLabel>
          <span className="tnum text-[11px] text-faint">
            {state.combos.filter((c) => !comboIsEmpty(c)).length} / {caps.max_combos} slots
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          {nonEmpty.length === 0 && (
            <div className="rounded-lg border border-line-soft bg-well/50 px-3 py-4 text-center text-[12px] text-faint">
              No combos yet. A combo fires an action when several keys are pressed together.
            </div>
          )}
          {nonEmpty.map(({ combo, index }) => (
            <button
              key={index}
              type="button"
              onClick={() => open(index)}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-120",
                index === sel
                  ? "border-accent bg-accent-dim/25"
                  : "border-line bg-raised hover:border-line-strong",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">
                {(index === sel && draft ? draft : combo).actions
                  .map((a) => keyActionGlyph(a).text || "·")
                  .join(" + ") || "—"}
                <span className="mx-1.5 text-faint">→</span>
                {keyActionGlyph((index === sel && draft ? draft : combo).output).text || "·"}
              </span>
              {(index === sel && draft ? draft : combo).layer !== undefined && (
                <Chip className="tnum shrink-0">
                  L{(index === sel && draft ? draft : combo).layer}
                </Chip>
              )}
            </button>
          ))}
          <Button variant="outline" onClick={addNew} disabled={!hasFree || editing}>
            <PlusIcon size={12} />
            {hasFree ? "Add combo" : "All slots in use"}
          </Button>
        </div>

        {editing && (
          <div className="mt-4 flex min-h-0 flex-col gap-3 border-t border-line-soft pt-3">
            <div>
              <SectionLabel>Trigger keys</SectionLabel>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {draft.actions.length === 0 && (
                  <span className="text-[12px] text-faint">Click keys on the board…</span>
                )}
                {draft.actions.map((action, i) => (
                  <TriggerChip
                    key={i}
                    action={action}
                    onRemove={() =>
                      setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                className="mt-1.5 cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors duration-120 hover:text-mute"
                onClick={() => setPickerOpen((v) => !v)}
              >
                {pickerOpen ? "Hide picker" : "Add a trigger without a physical key…"}
              </button>
              {pickerOpen && (
                <div className="mt-2">
                  <SlotPicker
                    numLayers={caps.num_layers}
                    onPick={(a) => {
                      toggleTrigger({ Single: a });
                      setPickerOpen(false);
                    }}
                  />
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
              Only on layer
              <select
                value={draft.layer ?? "any"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    layer: e.target.value === "any" ? undefined : Number(e.target.value),
                  })
                }
                className="rounded-lg border border-line bg-well px-2 py-1 text-[12.5px] text-ink"
              >
                <option value="any">Any layer</option>
                {Array.from({ length: caps.num_layers }, (_, n) => (
                  <option key={n} value={n}>
                    Layer {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-[11.5px] text-faint">
              Chord window: {state.behavior ? `${state.behavior.combo_timeout_ms} ms` : "—"} ·{" "}
              <button
                type="button"
                className="cursor-pointer underline underline-offset-2 transition-colors duration-120 hover:text-mute"
                onClick={goBehavior}
              >
                set in Behavior
              </button>
            </div>

            <div>
              <SectionLabel>Output</SectionLabel>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
                <span className="font-mono text-[13px] text-ink">
                  {keyActionGlyph(draft.output).text || "unset"}
                </span>
              </div>
              {/* fixed-height frame: keeps the editor's internal scrolling from
                  collapsing against the save bar below */}
              <div className="mt-2 flex h-[360px] shrink-0 flex-col rounded-lg border border-line-soft bg-well/40 p-2.5">
                <ActionEditor
                  key={sel}
                  current={draft.output}
                  numLayers={caps.num_layers}
                  onCommit={(output) => setDraft({ ...draft, output })}
                />
              </div>
            </div>

            {sel !== null && <SlotStatus kind="combos" index={sel} />}

            <div className="flex items-center gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!dirty || pending || draft.actions.length < 2 || draft.output === "No"}
                onClick={() => io.setSlot("combos", sel, JSON.parse(JSON.stringify(draft)) as Combo)}
              >
                Save combo
              </Button>
              <Button
                variant="danger"
                title="Delete this combo (frees the slot)"
                disabled={pending || (saved !== null && comboIsEmpty(saved))}
                onClick={() => {
                  io.setSlot("combos", sel, { actions: [], output: "No", layer: undefined });
                  close();
                }}
              >
                <TrashIcon size={13} />
              </Button>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
            {editing && draft.actions.length === 1 && (
              <div className="text-[11.5px] text-warn">A combo needs at least two trigger keys.</div>
            )}
          </div>
        )}
      </InspectorShell>
    </>
  );
}
