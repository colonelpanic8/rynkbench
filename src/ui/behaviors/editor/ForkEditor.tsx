// The fork editor in the editor shell (ADR 0020): the fork first (what makes
// it change), then its key and the two things it can become.

import { useState } from "react";
import type { Fork, KeyAction } from "../../../model/action-types";
import { emptyFork } from "../../../model/slots";
import { labelAt } from "../../../model/behavior-labels";
import { same } from "../../../model/deep-equal";
import { forkProblem } from "../../../model/fork-draft";
import { useWorkbench } from "../../state";
import { useTerms, useWording, type TermId } from "../../terms";
import { useKeyText } from "../../useKeyText";
import { SectionLabel } from "../../kit";
import { ActionEditor, ModGrid } from "../../keymap/ActionEditor";
import { StateBitsEditor } from "../../advanced/bits";
import { modifierSymbols } from "../../labels";
import { LIBRARY_KINDS } from "../library";
import type { BehaviorFocus } from "../focus";
import { EditorShell, type EditorCard } from "./EditorShell";
import { useApply } from "./useApply";

type Output = "trigger" | "negative_output" | "positive_output";
const OUTPUTS: { id: Output; term: TermId }[] = [
  { id: "trigger", term: "fork.trigger" },
  { id: "negative_output", term: "fork.negative" },
  { id: "positive_output", term: "fork.positive" },
];

function whenSummary(fork: Fork): string {
  const leds = Object.entries(fork.match_any.leds).flatMap(([led, on]) => (on ? [led.replace("_lock", "")] : []));
  const mouse = Object.values(fork.match_any.mouse).some(Boolean) ? ["mouse"] : [];
  return [modifierSymbols(fork.match_any.modifiers), ...leds, ...mouse].filter(Boolean).join(" · ") || "never";
}

export function ForkEditor({ focus, onClose }: { focus: BehaviorFocus; onClose: () => void }) {
  const { bundle, state } = useWorkbench();
  const wording = useWording();
  const term = useTerms();
  const keyText = useKeyText();
  const slot = focus === "new" ? null : focus;
  const original: Fork = slot === null ? emptyFork() : (state.forks[slot] ?? emptyFork());
  const ownName = slot === null ? "" : (labelAt(state.labels, "forks", slot)?.name ?? "");
  const [draft, setDraft] = useState<Fork>(() => structuredClone(original));
  const [name, setName] = useState(ownName);
  const [selected, setSelected] = useState<string>(slot === null ? "trigger" : "fork");
  const apply = useApply("forks", slot);
  const one = LIBRARY_KINDS.forks.one[wording];

  const cards: EditorCard[] = [
    { id: "fork", title: one, sub: whenSummary(draft) },
    ...OUTPUTS.map(({ id, term: label }) => ({ id, title: term(label), sub: keyText.glyph(draft[id]).text || "nothing yet" })),
  ];
  const output = OUTPUTS.find((entry) => entry.id === selected)?.id;

  return (
    <EditorShell
      subtitle={slot === null ? `New ${one.toLowerCase()}` : `${one} ${slot}`}
      name={name}
      onName={setName}
      namePlaceholder={slot === null ? one : `${one} ${slot}`}
      cards={cards}
      selected={selected}
      onSelect={setSelected}
      dirty={slot === null || name.trim() !== ownName || !same(draft, original)}
      problem={forkProblem(draft)}
      onApply={() => apply(draft, name)}
      onClose={onClose}
    >
      {output ? (
        <div className="flex h-[420px] shrink-0 flex-col rounded-lg border border-line-soft bg-well/40 p-2.5">
          <ActionEditor key={output} current={draft[output]} numLayers={bundle.caps.num_layers} onCommit={(action: KeyAction) => setDraft({ ...draft, [output]: action })} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <SectionLabel>{term("fork.match")}</SectionLabel>
            <StateBitsEditor value={draft.match_any} onChange={(match_any) => setDraft({ ...draft, match_any })} />
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>{term("fork.suppress")}</SectionLabel>
            <StateBitsEditor value={draft.match_none} onChange={(match_none) => setDraft({ ...draft, match_none })} />
          </div>
          <div className="flex flex-col gap-2">
            <SectionLabel>{term("fork.keep")}</SectionLabel>
            <ModGrid mods={draft.kept_modifiers} onChange={(kept_modifiers) => setDraft({ ...draft, kept_modifiers })} />
          </div>
        </div>
      )}
    </EditorShell>
  );
}
