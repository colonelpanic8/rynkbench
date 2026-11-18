// The macro editor in the editor shell (ADR 0020), as GLIDE's Macro Builder:
// the macro's details first, then its steps as compact rows (MacroStepList);
// the right pane edits the selected step, or adds steps (MacroAdd). Steps send
// a key, a layer or another macro through Pick Key's small picker. Nothing is
// written until Apply, which is one operation.

import { useEffect, useMemo, useState } from "react";
import { decodeMacros, encodeMacros, macroTableSize, type DecodedMacro, type MacroStep } from "../../../model/macros";
import { labelAt } from "../../../model/behavior-labels";
import { same } from "../../../model/deep-equal";
import { macroProblem, mayRunMacro, regionWith, withStep, withStepMoved, withStepsAt, withoutStep } from "../../../model/macro-draft";
import type { Pick } from "../../keymap/pickKey";
import { useWorkbench } from "../../state";
import { useWording } from "../../terms";
import { LIBRARY_KINDS } from "../library";
import type { BehaviorFocus } from "../focus";
import { EditorShell, type EditorCard } from "./EditorShell";
import { Heading, StepEditor, panelClass } from "./MacroSteps";
import { MacroStepList, stepId } from "./MacroStepList";
import { MacroAdd } from "./MacroAdd";
import { MacroSpace } from "./MacroSpace";
import { useApply } from "./useApply";

const ROOT = "macro";
const indexOf = (id: string) => (id.startsWith("s") ? Number(id.slice(1)) : -1);

/** Ctrl/Cmd+Z takes back the last move or removal while it is the latest change. */
function useUndoKey(undo: (() => void) | undefined) {
  useEffect(() => {
    if (!undo) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z" || typing) return;
      event.preventDefault();
      event.stopPropagation();
      undo();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [undo]);
}

export function MacroEditor({ focus, onClose }: { focus: BehaviorFocus; onClose: () => void }) {
  const { bundle, state } = useWorkbench();
  const wording = useWording();
  const region = state.macroOps;
  const free = region.findIndex((ops) => ops.length === 0);
  const slot = focus === "new" ? null : focus;
  const at = slot ?? (free >= 0 ? free : region.length);
  const original = useMemo<DecodedMacro>(() => (slot === null ? { steps: [] } : decodeMacros([region[slot] ?? []])[0]), [slot, region]);
  const ownName = slot === null ? "" : (labelAt(state.labels, "macros", slot)?.name ?? "");
  const [draft, setDraft] = useState<DecodedMacro>(() => structuredClone(original));
  const [name, setName] = useState(ownName);
  const [selected, setSelected] = useState(slot === null ? "add" : ROOT);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ before: DecodedMacro; after: DecodedMacro } | null>(null);
  const apply = useApply("macros", slot);
  const one = LIBRARY_KINDS.macros.one[wording];
  const space = { slots: bundle.caps.max_macros, bytes: bundle.caps.macro_space_size };
  const used = macroTableSize(regionWith(region, at, draft), space.slots);

  /** A change that Undo can take back (a move, a removal, Clear). */
  const undoable = (next: DecodedMacro, open = ROOT) => {
    setUndo({ before: draft, after: next });
    setDraft(next);
    setSelected(open);
  };
  const takeBack = undo && undo.after === draft ? () => { setDraft(undo.before); setUndo(null); } : undefined;
  useUndoKey(takeBack);

  // A step may run another macro, never one that comes back to this one.
  const allow = (pick: Pick) =>
    !(typeof pick === "object" && "TriggerMacro" in pick) || mayRunMacro(regionWith(region, at, draft), at, pick.TriggerMacro);

  const open = (id: string) => {
    if (id === "add" && selected !== "add") {
      const index = indexOf(selected);
      setInsertAt(index >= 0 ? index + 1 : null);
    }
    setSelected(id);
  };
  const addSteps = (steps: MacroStep[], openFirst = false) => {
    const place = Math.min(insertAt ?? draft.steps.length, draft.steps.length);
    setDraft(withStepsAt(draft, place, steps));
    setInsertAt(place + steps.length);
    if (openFirst) setSelected(stepId(place));
  };

  const index = indexOf(selected);
  const step = draft.steps[index];
  const cards: EditorCard[] = [
    { id: ROOT, title: `${one} details`, sub: `${draft.steps.length} step${draft.steps.length === 1 ? "" : "s"}` },
  ];

  return (
    <EditorShell
      subtitle={slot === null ? `New ${one.toLowerCase()}` : `${one} ${slot}`}
      name={name}
      onName={setName}
      namePlaceholder={`${one} ${at}`}
      cards={cards}
      selected={selected}
      onSelect={open}
      list={(openOnPhone) => (
        <MacroStepList
          steps={draft.steps}
          selected={selected}
          insertAt={insertAt}
          space={{ used, bytes: space.bytes }}
          onOpen={(id) => {
            open(id);
            openOnPhone(id);
          }}
          onMove={(from, to) => undoable(withStepMoved(draft, from, to))}
          onRemove={(at) => undoable(withoutStep(draft, at))}
          onClear={() => undoable({ steps: [] })}
          onUndo={takeBack}
        />
      )}
      dirty={slot === null || name.trim() !== ownName || !same(draft, original)}
      problem={macroProblem(draft, region, at, space)}
      onApply={() => apply(encodeMacros([draft])[0], name)}
      onClose={onClose}
    >
      {selected === "add" && <MacroAdd startOn={draft.steps.length === 0 ? "text" : "step"} allow={allow} onAdd={addSteps} />}
      {step && <StepEditor key={index} step={step} number={index + 1} allow={allow} onChange={(next) => setDraft(withStep(draft, index, next))} />}
      {selected === ROOT && (
        <>
          <Heading>{`${one} details`}</Heading>
          <div className={panelClass}>
            <MacroSpace used={used} bytes={space.bytes} />
            <p className="text-small text-faint">
              Every macro shares this space on the keyboard. Slot {at} of {space.slots}.
            </p>
          </div>
        </>
      )}
    </EditorShell>
  );
}
