// A macro's steps in the editor shell (ADR 0020): how a step reads on its
// card, and the editor of one step (its kind, its text, key or delay, and its
// place in the macro).

import { useState } from "react";
import type { MacroStep } from "../../../model/macros";
import { clampDelay } from "../../../model/macros";
import { hidLabel } from "../../labels";
import { KeycodeBrowser } from "../../keymap/ActionEditor";
import { Button, Segmented, TextInput } from "../../kit";

export function stepSummary(step: MacroStep): { tag: string; body: string } {
  switch (step.kind) {
    case "text":
      return { tag: "Text", body: step.text ? `“${step.text}”` : "empty" };
    case "tap":
      return { tag: "Tap", body: hidLabel(step.code) };
    case "press":
      return { tag: "Press", body: hidLabel(step.code) };
    case "release":
      return { tag: "Release", body: hidLabel(step.code) };
    case "native":
      return { tag: "Step", body: step.op === "PauseForRelease" ? "Wait for key release" : JSON.stringify(step.op) };
    case "delay":
      return { tag: "Delay", body: `${step.ms} ms` };
  }
}

type StepKind = "text" | "tap" | "press" | "release" | "delay";
const KINDS: { value: StepKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "tap", label: "Tap" },
  { value: "press", label: "Press" },
  { value: "release", label: "Release" },
  { value: "delay", label: "Delay" },
];

/** The step as another kind, keeping its key where both have one. */
function asKind(step: MacroStep, kind: StepKind): MacroStep {
  const code = "code" in step ? step.code : "A";
  if (kind === "text") return { kind, text: step.kind === "text" ? step.text : "" };
  if (kind === "delay") return { kind, ms: step.kind === "delay" ? step.ms : 100 };
  return { kind, code };
}

export function StepEditor({
  step,
  first,
  last,
  onChange,
  onMove,
}: {
  step: MacroStep;
  first: boolean;
  last: boolean;
  onChange: (next: MacroStep) => void;
  onMove: (by: -1 | 1) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {step.kind === "native" ? (
          <span className="flex-1 font-mono text-body text-mute">{stepSummary(step).body}</span>
        ) : (
          <Segmented items={KINDS} value={step.kind} onChange={(kind) => onChange(asKind(step, kind))} size="sm" className="flex-1" />
        )}
        <Button aria-label="Move up" disabled={first} reason="Already first" onClick={() => onMove(-1)}>
          ↑
        </Button>
        <Button aria-label="Move down" disabled={last} reason="Already last" onClick={() => onMove(1)}>
          ↓
        </Button>
      </div>
      {step.kind === "text" && (
        <TextInput autoFocus placeholder="Text to type" value={step.text} spellCheck={false} onChange={(event) => onChange({ kind: "text", text: event.target.value })} />
      )}
      {(step.kind === "tap" || step.kind === "press" || step.kind === "release") && (
        <>
          <span className="font-mono text-body text-ink">{hidLabel(step.code)}</span>
          <KeycodeBrowser compact modifierPicks={false} query={query} onQuery={setQuery} onPick={(code) => onChange({ kind: step.kind, code })} />
        </>
      )}
      {step.kind === "delay" && (
        <label className="flex items-center gap-2 text-body text-mute">
          <TextInput type="number" min={1} max={65535} value={step.ms} onChange={(event) => onChange({ kind: "delay", ms: clampDelay(Number(event.target.value)) })} className="w-28 text-right" />
          ms
        </label>
      )}
    </div>
  );
}
