import { macro_storage_size } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import type { Action, HidKeyCode, MacroOp } from "../vendor/rynk-wasm/rynk_wasm";

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type MacroStep =
  | { kind: "text"; text: string }
  | { kind: "tap"; code: HidKeyCode }
  | { kind: "press"; code: HidKeyCode }
  | { kind: "release"; code: HidKeyCode }
  | { kind: "delay"; ms: number }
  | { kind: "native"; op: MacroOp };

export interface DecodedMacro {
  steps: MacroStep[];
}

/** Characters the firmware's from_ascii understands (en-US). */
const TEXT_OK = /^[0-9a-zA-Z!@#$%^&*()\-_=+[\]{};:'"`~\\|,<.>/? \n\t]*$/;

export function isEncodableText(text: string): boolean {
  return TEXT_OK.test(text);
}

const MAX_DELAY_MS = 65535;

export function clampDelay(ms: number): number {
  return Math.max(0, Math.min(MAX_DELAY_MS, Math.round(ms)));
}

function stepOps(step: MacroStep): MacroOp[] {
  switch (step.kind) {
    case "text": return [...step.text].map((ch) => ({ Char: ch.charCodeAt(0) }));
    case "tap": return [{ Tap: { Key: { Hid: step.code } } }];
    case "press": return [{ Press: { Key: { Hid: step.code } } }];
    case "release": return [{ Release: { Key: { Hid: step.code } } }];
    case "delay": return [{ Delay: clampDelay(step.ms) }];
    case "native": return [structuredClone(step.op)];
  }
}

export function macroByteCost(macro: DecodedMacro): number {
  return macro_storage_size(macro.steps.flatMap(stepOps));
}

export function macroTableSize(macros: MacroOp[][], slots = macros.length): number {
  return macros.reduce((size, ops) => size + macro_storage_size(ops), 0) + Math.max(0, slots - macros.length);
}

export function encodeMacros(macros: DecodedMacro[]): MacroOp[][] {
  return macros.map((macro) => macro.steps.flatMap(stepOps));
}

function actionStep(kind: "tap" | "press" | "release", action: Action, op: MacroOp): MacroStep {
  if (typeof action === "object" && "Key" in action && typeof action.Key === "object" && "Hid" in action.Key) {
    return { kind, code: action.Key.Hid };
  }
  return { kind: "native", op: structuredClone(op) };
}

export function decodeMacros(macros: MacroOp[][]): DecodedMacro[] {
  return macros.map((ops) => {
    const steps: MacroStep[] = [];
    for (const op of ops) {
      if (typeof op === "string") {
        steps.push({ kind: "native", op });
      } else if ("Char" in op) {
        const last = steps.at(-1);
        const text = String.fromCharCode(op.Char);
        if (last?.kind === "text") last.text += text;
        else steps.push({ kind: "text", text });
      } else if ("Delay" in op) {
        steps.push({ kind: "delay", ms: op.Delay });
      } else if ("Tap" in op) {
        steps.push(actionStep("tap", op.Tap, op));
      } else if ("Press" in op) {
        steps.push(actionStep("press", op.Press, op));
      } else {
        steps.push(actionStep("release", op.Release, op));
      }
    }
    return { steps };
  });
}

/** Short human label for a macro: its leading text, else a step summary. */
export function macroPreview(macro: DecodedMacro): string {
  const first = macro.steps[0];
  if (first?.kind === "text") {
    const t = first.text.replace(/\s+/g, " ").trim();
    return t.length > 18 ? `${t.slice(0, 17)}…` : t || "(spaces)";
  }
  if (!first) return "empty";
  if (first.kind === "native") return first.op === "PauseForRelease" ? "wait for release" : "native action";
  if (first.kind === "delay") return `delay ${first.ms}ms…`;
  return `${first.kind} ${first.code}…`;
}
