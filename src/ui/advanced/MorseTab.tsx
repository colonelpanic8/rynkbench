// Morse (tap-dance): each slot maps tap/hold patterns to actions, with
// optional per-slot timing overrides on top of the global defaults.

import { useState } from "react";
import type { ReactNode } from "react";
import type { Action, Morse, MorseMode, MorseProfile } from "../../vendor/rynk-wasm/rynk_wasm";
import { actionLabel } from "../labels";
import { SlotPicker } from "../keymap/ActionEditor";
import { slotPendingId, useWorkbench } from "../state";
import type { MorseElement } from "../morse";
import { MAX_MORSE_ELEMENTS, elementsToPattern, morsePatternGlyph } from "../morse";
import { Button, InspectorShell, SectionLabel, TextInput, cx } from "../kit";
import { CloseIcon, PlusIcon, TrashIcon } from "../icons";
import { CenterScroll, SlotCard, SlotStatus, morseIsEmpty } from "./bits";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const EMPTY_PROFILE: MorseProfile = {
  unilateral_tap: undefined,
  enable_flow_tap: undefined,
  mode: undefined,
  hold_timeout_ms: undefined,
  gap_timeout_ms: undefined,
};

const MODES: Array<{ id: MorseMode; label: string }> = [
  { id: "Normal", label: "Normal" },
  { id: "PermissiveHold", label: "Permissive hold" },
  { id: "HoldOnOtherPress", label: "Hold on other press" },
];

function PatternBuilder({
  onAdd,
  disabled,
}: {
  onAdd: (pattern: number, action: Action) => void;
  disabled: boolean;
}) {
  const { bundle } = useWorkbench();
  const [elements, setElements] = useState<MorseElement[]>([]);
  const [action, setAction] = useState<Action>("No");

  const push = (el: MorseElement) => {
    if (elements.length < MAX_MORSE_ELEMENTS) setElements([...elements, el]);
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-well/60 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex min-h-8 min-w-0 flex-1 items-center rounded-lg border border-line bg-well px-2.5 font-mono text-[15px] tracking-wide text-accent">
          {elements.length > 0 ? (
            morsePatternGlyph(elementsToPattern(elements))
          ) : (
            <span className="text-[11.5px] font-sans tracking-normal text-faint">
              Build the tap/hold sequence…
            </span>
          )}
        </div>
        <button
          type="button"
          title="Remove last element"
          onClick={() => setElements(elements.slice(0, -1))}
          disabled={elements.length === 0}
          className="cursor-pointer rounded-md border border-line p-1.5 text-mute transition-colors duration-120 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CloseIcon size={11} />
        </button>
      </div>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          className="flex-1"
          disabled={elements.length >= MAX_MORSE_ELEMENTS}
          onClick={() => push("tap")}
        >
          ● Tap
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={elements.length >= MAX_MORSE_ELEMENTS}
          onClick={() => push("hold")}
        >
          ▬ Hold
        </Button>
      </div>
      <div className="text-[11px] text-faint">
        Action for this pattern:{" "}
        <span className={cx("font-mono", action === "No" ? "text-faint" : "text-ink")}>
          {actionLabel(action) || "unset"}
        </span>
      </div>
      <SlotPicker numLayers={bundle.caps.num_layers} onPick={setAction} />
      <Button
        variant="primary"
        disabled={disabled || elements.length === 0 || action === "No"}
        onClick={() => {
          onAdd(elementsToPattern(elements), action);
          setElements([]);
          setAction("No");
        }}
      >
        <PlusIcon size={12} />
        Add pattern
      </Button>
    </div>
  );
}

function ProfileEditor({
  value,
  onChange,
}: {
  value: MorseProfile;
  onChange: (next: MorseProfile) => void;
}) {
  const numOrDefault = (
    label: string,
    key: "hold_timeout_ms" | "gap_timeout_ms",
  ) => (
    <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
      {label}
      <span className="flex items-center gap-1.5">
        <TextInput
          type="number"
          min={50}
          max={5000}
          placeholder="default"
          value={value[key] ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              [key]: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-24 text-right"
        />
        <span className="text-faint">ms</span>
      </span>
    </label>
  );

  const triState = (
    label: string,
    key: "unilateral_tap" | "enable_flow_tap",
  ) => (
    <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
      {label}
      <select
        value={value[key] === undefined ? "default" : value[key] ? "on" : "off"}
        onChange={(e) =>
          onChange({
            ...value,
            [key]: e.target.value === "default" ? undefined : e.target.value === "on",
          })
        }
        className="rounded-lg border border-line bg-well px-2 py-1 text-[12.5px] text-ink"
      >
        <option value="default">Default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
        Mode
        <select
          value={value.mode ?? "default"}
          onChange={(e) =>
            onChange({
              ...value,
              mode: e.target.value === "default" ? undefined : (e.target.value as MorseMode),
            })
          }
          className="rounded-lg border border-line bg-well px-2 py-1 text-[12.5px] text-ink"
        >
          <option value="default">Default</option>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {numOrDefault("Hold timeout", "hold_timeout_ms")}
      {numOrDefault("Gap timeout", "gap_timeout_ms")}
      {triState("Unilateral tap", "unilateral_tap")}
      {triState("Flow tap", "enable_flow_tap")}
      <div className="text-[11px] leading-relaxed text-faint">
        Blank fields fall back to the global defaults.
      </div>
    </div>
  );
}

export function MorseTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, io } = useWorkbench();
  const caps = bundle.caps;

  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<Morse | null>(null);

  const editing = sel !== null && draft !== null;
  const saved = sel !== null ? state.morse[sel] : null;
  const dirty = editing && !same(draft, saved);
  const pending = sel !== null && state.pending[slotPendingId("morse", sel)]?.status === "pending";

  const open = (index: number) => {
    setSel(index);
    setDraft(JSON.parse(JSON.stringify(state.morse[index])) as Morse);
  };

  const close = () => {
    setSel(null);
    setDraft(null);
  };

  const addNew = () => {
    const free = state.morse.findIndex(morseIsEmpty);
    if (free === -1) return;
    setSel(free);
    setDraft({ profile: { ...EMPTY_PROFILE }, actions: [] });
  };

  const nonEmpty = state.morse
    .map((morse, index) => ({ morse, index }))
    .filter(({ morse, index }) => !morseIsEmpty(morse) || index === sel);
  const hasFree = state.morse.some(morseIsEmpty);
  const patternsFull = editing && draft.actions.length >= caps.max_patterns_per_key;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {nav}
        <CenterScroll>
          <div className="flex items-center justify-between px-1">
            <span className="text-[12.5px] text-faint">
              A morse key runs a different action per tap/hold pattern — tap-dance and beyond.
              Bind slots to keys from the keymap editor (Morse tab) or here via ● ▬ patterns.
            </span>
            <span className="tnum shrink-0 text-[11px] text-faint">
              {state.morse.filter((m) => !morseIsEmpty(m)).length} / {caps.max_morse} slots
            </span>
          </div>
          {nonEmpty.length === 0 && (
            <div className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-[12.5px] text-faint">
              No morse slots configured yet.
            </div>
          )}
          {nonEmpty.map(({ morse, index }) => {
            const shown = index === sel && draft ? draft : morse;
            return (
              <SlotCard key={index} selected={index === sel} onClick={() => open(index)}>
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md border border-cap-edge bg-cap px-1.5 py-0.5 font-mono text-[11.5px] text-cap-ink">
                    Mo{index}
                  </span>
                  <span className="tnum text-[12px] text-faint">
                    {shown.actions.length} pattern{shown.actions.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {shown.actions.map(([pattern, action], i) => (
                    <div key={i} className="flex items-center gap-3 text-[12.5px]">
                      <span className="w-28 shrink-0 font-mono tracking-wide text-accent">
                        {morsePatternGlyph(pattern)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {actionLabel(action) || "—"}
                      </span>
                    </div>
                  ))}
                  {shown.actions.length === 0 && (
                    <span className="text-[12px] text-faint">empty</span>
                  )}
                </div>
              </SlotCard>
            );
          })}
          <Button variant="outline" onClick={addNew} disabled={!hasFree || editing}>
            <PlusIcon size={12} />
            {hasFree ? "Add morse key" : "All slots in use"}
          </Button>
        </CenterScroll>
      </div>

      <InspectorShell>
        {!editing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-raised font-mono text-[14px] tracking-wide text-faint">
              ●▬●
            </div>
            <div className="text-[13.5px] font-medium text-mute">
              Select a morse slot to edit its patterns
            </div>
            <div className="text-[12px] leading-relaxed text-faint">
              Each pattern is a sequence of taps ● and holds ▬ (up to {MAX_MORSE_ELEMENTS}),
              resolved to an action when the sequence ends.
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Morse slot {sel}</SectionLabel>
              <span className="tnum text-[11px] text-faint">
                {draft.actions.length} / {caps.max_patterns_per_key} patterns
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {draft.actions.map(([pattern, action], i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5"
                >
                  <span className="w-24 shrink-0 font-mono text-[13px] tracking-wide text-accent">
                    {morsePatternGlyph(pattern)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {actionLabel(action) || "—"}
                  </span>
                  <button
                    type="button"
                    title="Remove pattern"
                    onClick={() =>
                      setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })
                    }
                    className="cursor-pointer text-faint transition-colors duration-120 hover:text-danger"
                  >
                    <CloseIcon size={11} />
                  </button>
                </div>
              ))}
              {draft.actions.length === 0 && (
                <div className="rounded-lg border border-line-soft bg-well/50 px-3 py-3 text-center text-[12px] text-faint">
                  No patterns yet — build one below.
                </div>
              )}
            </div>

            <PatternBuilder
              disabled={patternsFull}
              onAdd={(pattern, action) =>
                setDraft({ ...draft, actions: [...draft.actions, [pattern, action]] })
              }
            />
            {patternsFull && (
              <div className="text-[11.5px] text-warn">
                This slot is at its pattern limit ({caps.max_patterns_per_key}).
              </div>
            )}

            <div className="border-t border-line-soft pt-3">
              <SectionLabel>Timing overrides</SectionLabel>
              <div className="mt-2">
                <ProfileEditor
                  value={draft.profile}
                  onChange={(profile) => setDraft({ ...draft, profile })}
                />
              </div>
            </div>

            {sel !== null && <SlotStatus kind="morse" index={sel} />}

            <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!dirty || pending || draft.actions.length === 0}
                onClick={() => io.setSlot("morse", sel, JSON.parse(JSON.stringify(draft)) as Morse)}
              >
                Save morse key
              </Button>
              <Button
                variant="danger"
                title="Delete this morse key (frees the slot)"
                disabled={pending || (saved !== null && morseIsEmpty(saved))}
                onClick={() => {
                  io.setSlot("morse", sel, { profile: { ...EMPTY_PROFILE }, actions: [] });
                  close();
                }}
              >
                <TrashIcon size={13} />
              </Button>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        )}
      </InspectorShell>
    </>
  );
}
