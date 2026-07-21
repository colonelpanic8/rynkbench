// Forks (key overrides): a trigger key resolves to one of two outputs based
// on live modifier / lock-LED / mouse-button state.

import { useState } from "react";
import type { ReactNode } from "react";
import type { Fork } from "../../vendor/rynk-wasm/rynk_wasm";
import { keyActionGlyph, modifierSymbols, anyModifier } from "../labels";
import { ActionEditor, ModGrid } from "../keymap/ActionEditor";
import { slotPendingId, useWorkbench } from "../state";
import { Button, Chip, InspectorShell, SectionLabel } from "../kit";
import { PlusIcon, TrashIcon } from "../icons";
import {
  ActionSlotButton,
  CenterScroll,
  SlotCard,
  SlotStatus,
  StateBitsEditor,
  anyStateBits,
  emptyStateBits,
  forkIsEmpty,
} from "./bits";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function newFork(): Fork {
  return {
    trigger: "No",
    negative_output: "No",
    positive_output: "No",
    match_any: emptyStateBits(),
    match_none: emptyStateBits(),
    kept_modifiers: {
      left_ctrl: false,
      left_shift: false,
      left_alt: false,
      left_gui: false,
      right_ctrl: false,
      right_shift: false,
      right_alt: false,
      right_gui: false,
    },
    bindable: true,
  };
}

function bitsSummary(fork: Fork): string {
  const mods = modifierSymbols(fork.match_any.modifiers);
  const leds = Object.entries(fork.match_any.leds)
    .filter(([, on]) => on)
    .map(([k]) => k.replace("_lock", ""));
  const mouse = Object.values(fork.match_any.mouse).some(Boolean) ? ["mouse"] : [];
  const parts = [mods, ...leds, ...mouse].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "never";
}

type ForkSlot = "trigger" | "negative" | "positive";

export function ForksTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, io } = useWorkbench();
  const caps = bundle.caps;

  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<Fork | null>(null);
  const [slot, setSlot] = useState<ForkSlot>("trigger");
  const [advanced, setAdvanced] = useState(false);

  const editing = sel !== null && draft !== null;
  const saved = sel !== null ? state.forks[sel] : null;
  const dirty = editing && !same(draft, saved);
  const pending = sel !== null && state.pending[slotPendingId("forks", sel)]?.status === "pending";

  const open = (index: number) => {
    setSel(index);
    setDraft(JSON.parse(JSON.stringify(state.forks[index])) as Fork);
    setSlot("trigger");
    setAdvanced(false);
  };

  const close = () => {
    setSel(null);
    setDraft(null);
  };

  const addNew = () => {
    const free = state.forks.findIndex(forkIsEmpty);
    if (free === -1) return;
    setSel(free);
    setDraft(newFork());
    setSlot("trigger");
    setAdvanced(false);
  };

  const nonEmpty = state.forks
    .map((fork, index) => ({ fork, index }))
    .filter(({ fork, index }) => !forkIsEmpty(fork) || index === sel);
  const hasFree = state.forks.some(forkIsEmpty);

  const slotValue = (which: ForkSlot) =>
    which === "trigger"
      ? draft!.trigger
      : which === "negative"
        ? draft!.negative_output
        : draft!.positive_output;

  const setSlotValue = (which: ForkSlot, value: Fork["trigger"]) => {
    if (!draft) return;
    if (which === "trigger") setDraft({ ...draft, trigger: value });
    else if (which === "negative") setDraft({ ...draft, negative_output: value });
    else setDraft({ ...draft, positive_output: value });
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {nav}
        <CenterScroll>
          <div className="flex items-center justify-between px-1">
            <span className="text-[12.5px] text-faint">
              A fork overrides a key: when its match condition holds, the trigger produces the
              positive output instead of the negative one — Shift+Dot typing Semicolon, say.
            </span>
            <span className="tnum shrink-0 text-[11px] text-faint">
              {state.forks.filter((f) => !forkIsEmpty(f)).length} / {caps.max_forks} slots
            </span>
          </div>
          {nonEmpty.length === 0 && (
            <div className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-[12.5px] text-faint">
              No forks configured yet.
            </div>
          )}
          {nonEmpty.map(({ fork, index }) => {
            const shown = index === sel && draft ? draft : fork;
            return (
              <SlotCard key={index} selected={index === sel} onClick={() => open(index)}>
                <div className="flex items-center gap-3">
                  <span className="rounded-md border border-cap-edge bg-cap px-1.5 py-0.5 font-mono text-[12px] text-cap-ink">
                    {keyActionGlyph(shown.trigger).text || "·"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-mute">
                    <span className="text-ink">
                      {keyActionGlyph(shown.negative_output).text || "·"}
                    </span>
                    <span className="mx-1.5 text-faint">⇢</span>
                    <span className="text-accent">
                      {keyActionGlyph(shown.positive_output).text || "·"}
                    </span>
                  </span>
                  <Chip className="shrink-0">{bitsSummary(shown)}</Chip>
                  {!shown.bindable && (
                    <Chip tone="danger" className="shrink-0">
                      locked
                    </Chip>
                  )}
                </div>
              </SlotCard>
            );
          })}
          <Button variant="outline" onClick={addNew} disabled={!hasFree || editing}>
            <PlusIcon size={12} />
            {hasFree ? "Add fork" : "All slots in use"}
          </Button>
        </CenterScroll>
      </div>

      <InspectorShell>
        {!editing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-raised font-mono text-[15px] text-faint">
              ⑂
            </div>
            <div className="text-[13.5px] font-medium text-mute">Select a fork to edit it</div>
            <div className="text-[12px] leading-relaxed text-faint">
              Trigger, two outputs, and the modifier/lock/mouse state that flips between them.
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <SectionLabel>Fork slot {sel}</SectionLabel>

            <div className="flex gap-2">
              <ActionSlotButton
                label="Trigger"
                value={draft.trigger}
                active={slot === "trigger"}
                onClick={() => setSlot("trigger")}
              />
            </div>
            <div className="flex gap-2">
              <ActionSlotButton
                label="Normally"
                value={draft.negative_output}
                active={slot === "negative"}
                onClick={() => setSlot("negative")}
              />
              <ActionSlotButton
                label="When matched"
                value={draft.positive_output}
                active={slot === "positive"}
                onClick={() => setSlot("positive")}
              />
            </div>

            {/* fixed-height frame: the editor manages its own scrolling, so it
                must not flex-shrink against the sections below it */}
            <div className="flex h-[360px] shrink-0 flex-col rounded-lg border border-line-soft bg-well/40 p-2.5">
              <ActionEditor
                key={`${sel}:${slot}`}
                current={slotValue(slot)}
                numLayers={caps.num_layers}
                onCommit={(action) => setSlotValue(slot, action)}
              />
            </div>

            <div className="border-t border-line-soft pt-3">
              <SectionLabel>Match when any of</SectionLabel>
              <div className="mt-2">
                <StateBitsEditor
                  value={draft.match_any}
                  onChange={(match_any) => setDraft({ ...draft, match_any })}
                />
              </div>
              {!anyStateBits(draft.match_any) && (
                <div className="mt-1.5 text-[11.5px] text-warn">
                  Nothing selected — the positive output will never fire.
                </div>
              )}
            </div>

            <button
              type="button"
              className="cursor-pointer text-left text-[11.5px] text-faint underline underline-offset-2 transition-colors duration-120 hover:text-mute"
              onClick={() => setAdvanced((v) => !v)}
            >
              {advanced ? "Hide advanced matching" : "Advanced matching…"}
            </button>
            {advanced && (
              <div className="flex flex-col gap-3">
                <div>
                  <SectionLabel>Suppress when any of</SectionLabel>
                  <div className="mt-1 text-[11px] text-faint">
                    If any of these are active the fork is skipped entirely.
                  </div>
                  <div className="mt-2">
                    <StateBitsEditor
                      value={draft.match_none}
                      onChange={(match_none) => setDraft({ ...draft, match_none })}
                    />
                  </div>
                </div>
                <div>
                  <SectionLabel>Keep modifiers</SectionLabel>
                  <div className="mt-1 text-[11px] text-faint">
                    Matched modifiers are normally swallowed; keep these held through the output.
                  </div>
                  <div className="mt-2">
                    <ModGrid
                      mods={draft.kept_modifiers}
                      onChange={(kept_modifiers) => setDraft({ ...draft, kept_modifiers })}
                    />
                  </div>
                  {anyModifier(draft.kept_modifiers) && (
                    <div className="mt-1 text-[11.5px] text-accent">
                      Keeping {modifierSymbols(draft.kept_modifiers)}
                    </div>
                  )}
                </div>
                {!draft.bindable && (
                  <div className="text-[11.5px] text-warn">
                    The firmware marks this fork non-rebindable; writes may be rejected.
                  </div>
                )}
              </div>
            )}

            {sel !== null && <SlotStatus kind="forks" index={sel} />}

            <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                className="flex-1"
                disabled={
                  !dirty ||
                  pending ||
                  draft.trigger === "No" ||
                  (draft.negative_output === "No" && draft.positive_output === "No")
                }
                onClick={() => io.setSlot("forks", sel, JSON.parse(JSON.stringify(draft)) as Fork)}
              >
                Save fork
              </Button>
              <Button
                variant="danger"
                title="Delete this fork (frees the slot)"
                disabled={pending || (saved !== null && forkIsEmpty(saved))}
                onClick={() => {
                  io.setSlot("forks", sel, newFork());
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
