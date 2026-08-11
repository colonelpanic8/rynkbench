// Combos: trigger keys are captured by clicking keys on the board canvas;
// the output is picked with the standard action editor.

import { useState } from "react";
import type { ReactNode } from "react";
import type {
  ComboDefinition,
  KeyAction,
  MatrixPosition,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph } from "../labels";
import { ActionEditor, SlotPicker } from "../keymap/ActionEditor";
import { slotPendingId, useWorkbench } from "../state";
import { Button, Chip, InspectorShell, SectionLabel, cx } from "../kit";
import { CloseIcon, PlusIcon, TrashIcon } from "../icons";
import { SlotStatus, comboIsEmpty } from "./bits";
import {
  comboIsActions,
  comboLayer,
  comboOutput,
  comboTriggerCount,
  comboWithLayer,
  comboWithOutput,
  emptyComboDefinition,
  samePosition,
} from "../combos";

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

function PositionChip({ position, onRemove }: { position: MatrixPosition; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-cap-edge bg-cap px-2 py-1 font-mono text-[12.5px] text-cap-ink">
      r{position.row}c{position.col}
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
  const [draft, setDraft] = useState<ComboDefinition | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const editing = sel !== null && draft !== null;
  const saved = sel !== null ? state.combos[sel] : null;
  const dirty = editing && !same(draft, saved);
  const pending = sel !== null && state.pending[slotPendingId("combos", sel)]?.status === "pending";

  const open = (index: number) => {
    setSel(index);
    setDraft(structuredClone(state.combos[index]));
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
    setDraft(emptyComboDefinition());
    setPickerOpen(false);
  };

  const nonEmpty = state.combos
    .map((combo, index) => ({ combo, index }))
    .filter(({ combo, index }) => !comboIsEmpty(combo) || index === sel);
  const hasFree = state.combos.some(comboIsEmpty);

  // Trigger capture reads actions from the combo's scoped layer, else the
  // default layer — that is the keymap the chord will be matched against.
  const captureLayer = draft ? (comboLayer(draft) ?? state.defaultLayer) : state.defaultLayer;
  const layerActions = state.layers[captureLayer];

  const toggleTrigger = (action: KeyAction) => {
    if (!draft || !comboIsActions(draft)) return;
    if (action === "No" || action === "Transparent") return;
    const combo = draft.Actions;
    const at = combo.actions.findIndex((a) => same(a, action));
    if (at >= 0) {
      setDraft({ Actions: { ...combo, actions: combo.actions.filter((_, i) => i !== at) } });
    } else if (combo.actions.length < caps.max_combo_keys) {
      setDraft({ Actions: { ...combo, actions: [...combo.actions, action] } });
    }
  };

  const togglePosition = (position: MatrixPosition) => {
    if (!draft || comboIsActions(draft)) return;
    const combo = draft.Positions;
    const at = combo.positions.findIndex((candidate) => samePosition(candidate, position));
    if (at >= 0) {
      setDraft({
        Positions: { ...combo, positions: combo.positions.filter((_, index) => index !== at) },
      });
    } else if (combo.positions.length < caps.max_combo_keys) {
      setDraft({ Positions: { ...combo, positions: [...combo.positions, position] } });
    }
  };

  const decorFor = (key: KeyView): KeyDecor => {
    const action = layerActions?.[key.row * cols + key.col];
    const glyph = action !== undefined ? keyActionGlyph(action) : { text: "" };
    if (!glyph.text && key.label) {
      glyph.text = key.label;
      glyph.dim = true;
    }
    const isTrigger = editing && draft !== null && (comboIsActions(draft)
      ? action !== undefined && draft.Actions.actions.some((candidate) => same(candidate, action))
      : draft.Positions.positions.some((position) => samePosition(position, key)));
    return {
      glyph,
      inSelection: isTrigger,
      disabled:
        editing && draft !== null && comboIsActions(draft) &&
        (action === "No" || action === "Transparent"),
    };
  };

  const triggerCount = draft ? comboTriggerCount(draft) : 0;
  const full = editing && triggerCount >= caps.max_combo_keys;

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
                {triggerCount} / {caps.max_combo_keys} keys
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
              if (draft && comboIsActions(draft)) {
                const action = layerActions?.[key.row * cols + key.col];
                if (action !== undefined) toggleTrigger(action);
              } else {
                togglePosition({ row: key.row, col: key.col });
              }
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
                {(() => {
                  const displayed = index === sel && draft ? draft : combo;
                  return comboIsActions(displayed)
                    ? displayed.Actions.actions.map((a) => keyActionGlyph(a).text || "·").join(" + ") || "—"
                    : displayed.Positions.positions.map((p) => `r${p.row}c${p.col}`).join(" + ") || "—";
                })()}
                <span className="mx-1.5 text-faint">→</span>
                {keyActionGlyph(comboOutput(index === sel && draft ? draft : combo)).text || "·"}
              </span>
              {comboLayer(index === sel && draft ? draft : combo) !== undefined && (
                <Chip className="tnum shrink-0">
                  L{comboLayer(index === sel && draft ? draft : combo)}
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
              <div className="flex items-center justify-between gap-3">
                <SectionLabel>Trigger keys</SectionLabel>
                <select
                  value={comboIsActions(draft) ? "actions" : "positions"}
                  onChange={(event) => {
                    const output = comboOutput(draft);
                    const layer = comboLayer(draft);
                    setDraft(event.target.value === "actions"
                      ? { Actions: { actions: [], output, layer } }
                      : { Positions: { positions: [], output, layer } });
                    setPickerOpen(false);
                  }}
                  className="rounded-lg border border-line bg-well px-2 py-1 text-[12px] text-ink"
                >
                  <option value="actions">Match actions</option>
                  <option value="positions">Match positions</option>
                </select>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {triggerCount === 0 && (
                  <span className="text-[12px] text-faint">Click keys on the board…</span>
                )}
                {comboIsActions(draft)
                  ? draft.Actions.actions.map((action, i) => (
                      <TriggerChip
                        key={i}
                        action={action}
                        onRemove={() => setDraft({
                          Actions: {
                            ...draft.Actions,
                            actions: draft.Actions.actions.filter((_, j) => j !== i),
                          },
                        })}
                      />
                    ))
                  : draft.Positions.positions.map((position, i) => (
                      <PositionChip
                        key={`${position.row}:${position.col}`}
                        position={position}
                        onRemove={() => setDraft({
                          Positions: {
                            ...draft.Positions,
                            positions: draft.Positions.positions.filter((_, j) => j !== i),
                          },
                        })}
                      />
                    ))}
              </div>
              {comboIsActions(draft) && (
                <>
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
                </>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
              Only on layer
              <select
                value={comboLayer(draft) ?? "any"}
                onChange={(e) => setDraft(comboWithLayer(
                  draft,
                  e.target.value === "any" ? undefined : Number(e.target.value),
                ))}
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
                  {keyActionGlyph(comboOutput(draft)).text || "unset"}
                </span>
              </div>
              {/* fixed-height frame: keeps the editor's internal scrolling from
                  collapsing against the save bar below */}
              <div className="mt-2 flex h-[360px] shrink-0 flex-col rounded-lg border border-line-soft bg-well/40 p-2.5">
                <ActionEditor
                  key={sel}
                  current={comboOutput(draft)}
                  numLayers={caps.num_layers}
                  onCommit={(output) => setDraft(comboWithOutput(draft, output))}
                />
              </div>
            </div>

            {sel !== null && <SlotStatus kind="combos" index={sel} />}

            <div className="flex items-center gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!dirty || pending || triggerCount < 2 || comboOutput(draft) === "No"}
                onClick={() => io.setSlot("combos", sel, structuredClone(draft))}
              >
                Save combo
              </Button>
              <Button
                variant="danger"
                title="Delete this combo (frees the slot)"
                disabled={pending || (saved !== null && comboIsEmpty(saved))}
                onClick={() => {
                  io.setSlot("combos", sel, emptyComboDefinition());
                  close();
                }}
              >
                <TrashIcon size={13} />
              </Button>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
            {editing && triggerCount === 1 && (
              <div className="text-[11.5px] text-warn">A combo needs at least two trigger keys.</div>
            )}
          </div>
        )}
      </InspectorShell>
    </>
  );
}
