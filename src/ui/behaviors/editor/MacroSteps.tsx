// A macro's steps as GLIDE shows them: each step's kind as a coloured word and
// what it sends in short (the list), and the editor of the selected step on the
// right: how it sends its key, layer or behavior (picked with Pick Key's small
// picker), its text, or how long it pauses.

import type { Action } from "../../../model/action-types";
import type { Pick } from "../../keymap/pickKey";
import { clampDelay, type MacroStep, type SendKind } from "../../../model/macros";
import { withSendKind } from "../../../model/macro-draft";
import { useKeyText } from "../../useKeyText";
import { PickKey } from "../../keymap/PickKey";
import { Segmented, TextInput } from "../../kit";

export const SEND_KINDS: ReadonlyArray<{ value: SendKind; label: string; hint: string }> = [
  { value: "tap", label: "Tap and release", hint: "Presses the key and lets it go before the next step." },
  { value: "press", label: "Hold down", hint: "Presses the key and keeps it held down." },
  { value: "release", label: "Release", hint: "Lets go of a key an earlier step held down." },
];

const KIND_WORD: Record<MacroStep["kind"], string> = {
  tap: "Tap",
  press: "Hold",
  release: "Release",
  text: "Type",
  delay: "Pause",
  letGo: "On release",
};

/** The colour of a step's kind word, as GLIDE colours its mode headings. */
export function kindTone(kind: MacroStep["kind"]): string {
  if (kind === "tap" || kind === "press") return "text-warn";
  if (kind === "release" || kind === "letGo") return "text-macro-release";
  return "text-mute";
}

/** A step in short: its kind word and what it sends. */
export function useStepText(): (step: MacroStep) => { kind: string; body: string } {
  const keyText = useKeyText();
  return (step) => {
    const kind = KIND_WORD[step.kind];
    switch (step.kind) {
      case "text":
        return { kind, body: step.text ? `“${step.text}”` : "nothing yet" };
      case "delay":
        return { kind, body: `${step.ms} ms` };
      case "letGo":
        return { kind, body: "The steps below run when you let go" };
      default:
        return { kind, body: keyText.label(step.action) || "nothing" };
    }
  };
}

/** The small picker a macro step uses: keys, layers and your macros (a tap
 *  pattern is a whole key, so a step cannot send one). */
export function StepPicker({ onPick, allow }: { onPick: (action: Action) => void; allow: (pick: Pick) => boolean }) {
  return (
    <PickKey
      compact
      scope="slot"
      offer={{ keys: true, layers: true, behaviors: true }}
      allow={allow}
      onPick={(pick) => {
        if (typeof pick === "object" && "Morse" in pick) return;
        if (pick !== "Transparent") onPick(pick);
      }}
    />
  );
}

export function SendKindChoice({ value, onChange }: { value: SendKind; onChange: (kind: SendKind) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented items={SEND_KINDS} value={value} onChange={onChange} size="sm" />
      <p className="text-small text-faint">{SEND_KINDS.find((kind) => kind.value === value)?.hint}</p>
    </div>
  );
}

export const panelClass = "flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-4";

export function Heading({ children }: { children: string }) {
  return <div className="text-caption font-semibold uppercase tracking-widest text-mute">{children}</div>;
}

export function StepEditor({
  step,
  number,
  allow,
  onChange,
}: {
  step: MacroStep;
  /** Its place in the macro, from 1. */
  number: number;
  allow: (pick: Pick) => boolean;
  onChange: (next: MacroStep) => void;
}) {
  const stepText = useStepText();
  if (step.kind === "text") {
    return (
      <>
        <Heading>{`Step ${number} types`}</Heading>
        <TextInput autoFocus placeholder="Text to type" value={step.text} spellCheck={false} onChange={(event) => onChange({ kind: "text", text: event.target.value })} />
        <p className="text-small text-faint">Plain ASCII, as typed on a US keyboard.</p>
      </>
    );
  }
  if (step.kind === "delay") {
    return (
      <>
        <Heading>{`Step ${number} pauses (ms)`}</Heading>
        <TextInput
          type="number"
          min={0}
          max={65535}
          aria-label="Pause in milliseconds"
          value={step.ms}
          onChange={(event) => onChange({ kind: "delay", ms: clampDelay(Number(event.target.value)) })}
          className="w-40"
        />
        <p className="text-small text-faint">Allowed: 0 to 65535 ms.</p>
      </>
    );
  }
  if (step.kind === "letGo") {
    return <p className="text-body leading-relaxed text-mute">The steps above run when the key is pressed; the steps below run when it is let go. Use the × on the line to remove it.</p>;
  }
  return (
    <>
      <Heading>{`Step ${number} sends`}</Heading>
      <div className={panelClass}>
        <SendKindChoice value={step.kind} onChange={(kind) => onChange(withSendKind(step, kind))} />
      </div>
      <div className="rounded-lg border border-line-strong bg-raised px-3 py-1.5 font-mono text-body font-semibold text-ink">{stepText(step).body}</div>
      <StepPicker allow={allow} onPick={(action) => onChange({ kind: step.kind, action })} />
    </>
  );
}
