// Editing one macro in its editor (ADR 0020): its steps added, changed, moved
// and removed, which macros a step may run, and what stops it from being
// applied. Pure but for the byte count, which is the firmware's encoding
// (model/macros.ts).

import type { Action, MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import { encodeMacros, isEncodableText, isSendStep, macroTableSize, type DecodedMacro, type MacroStep, type SendKind } from "./macros";

/** What a new delay waits, in milliseconds. */
export const NEW_DELAY_MS = 50;

export function withStep(macro: DecodedMacro, index: number, step: MacroStep): DecodedMacro {
  return { steps: macro.steps.map((each, i) => (i === index ? step : each)) };
}

export function withoutStep(macro: DecodedMacro, index: number): DecodedMacro {
  return { steps: macro.steps.filter((_, i) => i !== index) };
}

/** The macro with `steps` put in at `at` (clamped to the ends). */
export function withStepsAt(macro: DecodedMacro, at: number, steps: readonly MacroStep[]): DecodedMacro {
  const place = Math.max(0, Math.min(at, macro.steps.length));
  return { steps: [...macro.steps.slice(0, place), ...steps, ...macro.steps.slice(place)] };
}

/** The macro with step `from` moved so it ends up at index `to`; unchanged when
 *  either is outside the list or they are the same. */
export function withStepMoved(macro: DecodedMacro, from: number, to: number): DecodedMacro {
  const count = macro.steps.length;
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return macro;
  const steps = [...macro.steps];
  const [step] = steps.splice(from, 1);
  steps.splice(to, 0, step);
  return { steps };
}

/** Where a step dropped just before (`after` false) or after a row lands, as
 *  the index it ends up at once taken out of its place; null where nothing moves. */
export function dropIndex(from: number, target: number, after: boolean): number | null {
  const slot = after ? target + 1 : target;
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

/** A step that sends `action` the way `kind` says. */
export function sendStep(kind: SendKind, action: Action): MacroStep {
  return { kind, action };
}

/** The same step sent another way; any other step is returned as it is. */
export function withSendKind(step: MacroStep, kind: SendKind): MacroStep {
  return isSendStep(step) ? { kind, action: step.action } : step;
}

/** The macro region with this macro in its slot (a new one in `slot`, the first free). */
export function regionWith(region: readonly MacroOp[][], slot: number, macro: DecodedMacro): MacroOp[][] {
  const next = [...region];
  while (next.length <= slot) next.push([]);
  next[slot] = encodeMacros([macro])[0];
  return next;
}

/** The macros a macro's steps run, in order, each once. */
export function macrosRunBy(ops: readonly MacroOp[]): number[] {
  const found: number[] = [];
  for (const op of ops) {
    if (typeof op === "string" || !("Tap" in op || "Press" in op || "Release" in op)) continue;
    const action = "Tap" in op ? op.Tap : "Press" in op ? op.Press : op.Release;
    if (typeof action === "object" && "TriggerMacro" in action && !found.includes(action.TriggerMacro)) found.push(action.TriggerMacro);
  }
  return found;
}

/** Whether a step of macro `slot` may run macro `target`: not itself, and not a
 *  macro that, directly or through others, runs `slot` again (it would never end). */
export function mayRunMacro(region: readonly MacroOp[][], slot: number, target: number): boolean {
  const seen = new Set<number>();
  const walk = (at: number): boolean => {
    if (at === slot) return false;
    if (seen.has(at)) return true;
    seen.add(at);
    return macrosRunBy(region[at] ?? []).every(walk);
  };
  return walk(target);
}

/** Why the macro cannot be applied as it is, or null. `space`: the region's slots and bytes. */
export function macroProblem(macro: DecodedMacro, region: readonly MacroOp[][], slot: number, space: { slots: number; bytes: number }): string | null {
  if (macro.steps.length === 0) return "Add a step first";
  for (const [index, step] of macro.steps.entries()) {
    if (step.kind === "text" && step.text.length === 0) return `Step ${index + 1}: the text is empty`;
    if (step.kind === "text" && !isEncodableText(step.text)) return `Step ${index + 1}: only plain ASCII text fits in a macro`;
  }
  const next = regionWith(region, slot, macro);
  if (macrosRunBy(next[slot]).some((target) => !mayRunMacro(next, slot, target))) return "A step runs this macro again, so it would never end";
  const size = macroTableSize(next, space.slots);
  return size > space.bytes ? `Not enough macro space: ${size} of ${space.bytes} bytes` : null;
}
