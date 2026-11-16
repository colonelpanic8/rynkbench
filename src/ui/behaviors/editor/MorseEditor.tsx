// The tap pattern (morse) editor in the editor shell (ADR 0020): the entry's
// timing first, then one card per pattern of taps and holds with what it does.

import { useState } from "react";
import type { Action, Morse } from "../../../model/action-types";
import { emptyMorse } from "../../../model/slots";
import { labelAt } from "../../../model/behavior-labels";
import { same } from "../../../model/deep-equal";
import { MAX_MORSE_ELEMENTS, elementsToPattern, morsePatternGlyph, patternElements, type MorseElement } from "../../../model/morse";
import { morseProblem, withNewPattern, withoutPattern, withPattern, withPatternAction } from "../../../model/morse-draft";
import { useWorkbench } from "../../state";
import { useTerms, useWording } from "../../terms";
import { useKeyText } from "../../useKeyText";
import { Button, SectionLabel } from "../../kit";
import { SlotPicker } from "../../keymap/ActionEditor";
import { morseProfileSummary } from "../../morse-profile";
import { LIBRARY_KINDS } from "../library";
import type { BehaviorFocus } from "../focus";
import { EditorShell, type EditorCard } from "./EditorShell";
import { TimingFields } from "./TimingFields";
import { useApply } from "./useApply";

function PatternEditor({ elements, action, onElements, onAction }: { elements: MorseElement[]; action: Action; onElements: (next: MorseElement[]) => void; onAction: (next: Action) => void }) {
  const term = useTerms();
  const keyText = useKeyText();
  const { bundle } = useWorkbench();
  const full = elements.length >= MAX_MORSE_ELEMENTS;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="min-h-9 flex-1 rounded-lg border border-line bg-well px-3 py-1.5 font-mono text-title tracking-wide text-accent">{morsePatternGlyph(elementsToPattern(elements))}</span>
        <Button disabled={elements.length <= 1} reason="A pattern needs a tap or a hold" onClick={() => onElements(elements.slice(0, -1))} aria-label="Remove the last">
          ⌫
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Button className="flex-1" disabled={full} reason={`At most ${MAX_MORSE_ELEMENTS}`} onClick={() => onElements([...elements, "tap"])}>
          ● Tap
        </Button>
        <Button className="flex-1" disabled={full} reason={`At most ${MAX_MORSE_ELEMENTS}`} onClick={() => onElements([...elements, "hold"])}>
          ▬ Hold
        </Button>
      </div>
      <SectionLabel>
        {term("morse.does")}: <span className="font-mono normal-case tracking-normal text-ink">{keyText.label(action) || "nothing"}</span>
      </SectionLabel>
      <SlotPicker numLayers={bundle.caps.num_layers} onPick={onAction} />
    </div>
  );
}

export function MorseEditor({ focus, onClose }: { focus: BehaviorFocus; onClose: () => void }) {
  const { bundle, state } = useWorkbench();
  const wording = useWording();
  const term = useTerms();
  const keyText = useKeyText();
  const slot = focus === "new" ? null : focus;
  const original: Morse = slot === null ? emptyMorse() : (state.morse[slot] ?? emptyMorse());
  const ownName = slot === null ? "" : (labelAt(state.labels, "morse", slot)?.name ?? "");
  const [draft, setDraft] = useState<Morse>(() => (slot === null ? withNewPattern(emptyMorse()) : structuredClone(original)));
  const [name, setName] = useState(ownName);
  const [selected, setSelected] = useState(slot === null ? "p0" : "timing");
  const apply = useApply("morse", slot);
  const one = LIBRARY_KINDS.morse.one[wording];
  const max = bundle.caps.max_patterns_per_key;

  const remove = (index: number) => {
    setDraft(withoutPattern(draft, index));
    setSelected("timing");
  };
  const cards: EditorCard[] = [
    { id: "timing", title: term("morse.timing"), sub: morseProfileSummary(draft.profile) },
    ...draft.actions.map(([pattern, action], index) => ({
      id: `p${index}`,
      title: <span className="font-mono tracking-wide text-accent">{morsePatternGlyph(pattern)}</span>,
      sub: keyText.label(action) || "nothing yet",
      onRemove: () => remove(index),
    })),
  ];
  const index = selected.startsWith("p") ? Number(selected.slice(1)) : -1;
  const entry = draft.actions[index];

  return (
    <EditorShell
      subtitle={slot === null ? `New ${one.toLowerCase()}` : `${one} ${slot}`}
      name={name}
      onName={setName}
      namePlaceholder={slot === null ? one : `${one} ${slot}`}
      cards={cards}
      selected={entry ? selected : "timing"}
      onSelect={setSelected}
      add={{
        label: "Add pattern",
        disabled: draft.actions.length >= max,
        reason: `At most ${max} patterns fit`,
        onClick: () => {
          setDraft(withNewPattern(draft));
          setSelected(`p${draft.actions.length}`);
        },
      }}
      dirty={slot === null || name.trim() !== ownName || !same(draft, original)}
      problem={morseProblem(draft, max)}
      onApply={() => apply(draft, name)}
      onClose={onClose}
    >
      {entry ? (
        <PatternEditor
          key={index}
          elements={patternElements(entry[0])}
          action={entry[1]}
          onElements={(elements) => setDraft(withPattern(draft, index, elements))}
          onAction={(action) => setDraft(withPatternAction(draft, index, action))}
        />
      ) : (
        <TimingFields value={draft.profile} onChange={(profile) => setDraft({ ...draft, profile })} />
      )}
    </EditorShell>
  );
}
