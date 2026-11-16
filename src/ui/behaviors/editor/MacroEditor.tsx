// The macro editor in the editor shell (ADR 0020): the macro first (how much
// of the shared macro space it takes), then a card per step.

import { useMemo, useState } from "react";
import { decodeMacros, encodeMacros, macroTableSize, type DecodedMacro } from "../../../model/macros";
import { labelAt } from "../../../model/behavior-labels";
import { same } from "../../../model/deep-equal";
import { macroProblem, newStep, regionWith, withoutStep, withStep, withStepMoved } from "../../../model/macro-draft";
import { useWorkbench } from "../../state";
import { useWording } from "../../terms";
import { SectionLabel, cx } from "../../kit";
import { LIBRARY_KINDS } from "../library";
import type { BehaviorFocus } from "../focus";
import { EditorShell, type EditorCard } from "./EditorShell";
import { StepEditor, stepSummary } from "./MacroSteps";
import { useApply } from "./useApply";

function Space({ used, bytes }: { used: number; bytes: number }) {
  const over = used > bytes;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Macro space</SectionLabel>
        <span className={cx("tnum text-body", over ? "text-danger" : "text-mute")}>
          {used} / {bytes} bytes
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-well">
        <div className={cx("h-full rounded-full", over ? "bg-danger" : "bg-accent-deep")} style={{ width: `${Math.min(100, (used / Math.max(1, bytes)) * 100)}%` }} />
      </div>
    </div>
  );
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
  const [draft, setDraft] = useState<DecodedMacro>(() => (slot === null ? { steps: [newStep()] } : structuredClone(original)));
  const [name, setName] = useState(ownName);
  const [selected, setSelected] = useState(slot === null ? "s0" : "macro");
  const apply = useApply("macros", slot);
  const one = LIBRARY_KINDS.macros.one[wording];
  const space = { slots: bundle.caps.max_macros, bytes: bundle.caps.macro_space_size };

  const remove = (index: number) => {
    setDraft(withoutStep(draft, index));
    setSelected("macro");
  };
  const cards: EditorCard[] = [
    { id: "macro", title: one, sub: `${draft.steps.length} step${draft.steps.length === 1 ? "" : "s"}` },
    ...draft.steps.map((step, index) => {
      const { tag, body } = stepSummary(step);
      return { id: `s${index}`, title: tag, sub: body, onRemove: () => remove(index) };
    }),
  ];
  const index = selected.startsWith("s") ? Number(selected.slice(1)) : -1;
  const step = draft.steps[index];

  return (
    <EditorShell
      subtitle={slot === null ? `New ${one.toLowerCase()}` : `${one} ${slot}`}
      name={name}
      onName={setName}
      namePlaceholder={`${one} ${at}`}
      cards={cards}
      selected={step ? selected : "macro"}
      onSelect={setSelected}
      add={{
        label: "Add step",
        onClick: () => {
          setDraft({ steps: [...draft.steps, newStep()] });
          setSelected(`s${draft.steps.length}`);
        },
      }}
      dirty={slot === null || name.trim() !== ownName || !same(draft, original)}
      problem={macroProblem(draft, region, at, space)}
      onApply={() => apply(encodeMacros([draft])[0], name)}
      onClose={onClose}
    >
      {step ? (
        <StepEditor
          key={index}
          step={step}
          first={index === 0}
          last={index === draft.steps.length - 1}
          onChange={(next) => setDraft(withStep(draft, index, next))}
          onMove={(by) => {
            setDraft(withStepMoved(draft, index, by));
            setSelected(`s${index + by}`);
          }}
        />
      ) : (
        <Space used={macroTableSize(regionWith(region, at, draft), space.slots)} bytes={space.bytes} />
      )}
    </EditorShell>
  );
}
