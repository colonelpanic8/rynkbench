// Editing one macro in its editor (ADR 0020): its steps added, changed, moved
// and removed, and what stops it from being applied. Pure but for the byte
// count, which is the firmware's encoding (model/macros.ts).

import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import { encodeMacros, isEncodableText, macroTableSize, type DecodedMacro, type MacroStep } from "./macros";

export const newStep = (): MacroStep => ({ kind: "text", text: "" });

export function withStep(macro: DecodedMacro, index: number, step: MacroStep): DecodedMacro {
  return { steps: macro.steps.map((each, i) => (i === index ? step : each)) };
}

export function withoutStep(macro: DecodedMacro, index: number): DecodedMacro {
  return { steps: macro.steps.filter((_, i) => i !== index) };
}

/** The macro with a step moved one place up (-1) or down (+1); unchanged at an end. */
export function withStepMoved(macro: DecodedMacro, index: number, by: -1 | 1): DecodedMacro {
  const to = index + by;
  if (to < 0 || to >= macro.steps.length) return macro;
  const steps = [...macro.steps];
  [steps[index], steps[to]] = [steps[to], steps[index]];
  return { steps };
}

/** The macro region with this macro in its slot (a new one in `slot`, the first free). */
export function regionWith(region: readonly MacroOp[][], slot: number, macro: DecodedMacro): MacroOp[][] {
  const next = [...region];
  while (next.length <= slot) next.push([]);
  next[slot] = encodeMacros([macro])[0];
  return next;
}

/** Why the macro cannot be applied as it is, or null. `space`: the region's slots and bytes. */
export function macroProblem(macro: DecodedMacro, region: readonly MacroOp[][], slot: number, space: { slots: number; bytes: number }): string | null {
  if (macro.steps.length === 0) return "Add a step first";
  for (const step of macro.steps) {
    if (step.kind === "text" && step.text.length === 0) return "A text step is empty";
    if (step.kind === "text" && !isEncodableText(step.text)) return "Only plain ASCII text fits in a macro";
  }
  const size = macroTableSize(regionWith(region, slot, macro), space.slots);
  return size > space.bytes ? `Not enough macro space: ${size} of ${space.bytes} bytes` : null;
}
