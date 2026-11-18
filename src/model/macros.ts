import { macro_storage_size } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import type { Action, HidKeyCode, MacroOp } from "../vendor/rynk-wasm/rynk_wasm";

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** How a step sends its action: pressed and released, held down, or let go. */
export type SendKind = "tap" | "press" | "release";

/** One step of a macro, as the editor shows it. Every firmware op has its own
 *  kind, so a macro decodes and encodes back unchanged. */
export type MacroStep =
  | { kind: "text"; text: string }
  | { kind: SendKind; action: Action }
  | { kind: "delay"; ms: number }
  /** The steps after it run when the key is let go (PauseForRelease). */
  | { kind: "letGo" };

export interface DecodedMacro {
  steps: MacroStep[];
}

/** A step that sends a plain key. */
export function hidStep(kind: SendKind, code: HidKeyCode): MacroStep {
  return { kind, action: { Key: { Hid: code } } };
}

export function isSendStep(step: MacroStep): step is { kind: SendKind; action: Action } {
  return step.kind === "tap" || step.kind === "press" || step.kind === "release";
}

/** The plain key an action presses, if that is all it does. */
export function plainHid(action: Action): HidKeyCode | null {
  return typeof action === "object" && "Key" in action && typeof action.Key === "object" && "Hid" in action.Key ? action.Key.Hid : null;
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
    case "tap": return [{ Tap: structuredClone(step.action) }];
    case "press": return [{ Press: structuredClone(step.action) }];
    case "release": return [{ Release: structuredClone(step.action) }];
    case "delay": return [{ Delay: clampDelay(step.ms) }];
    case "letGo": return ["PauseForRelease"];
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

export function decodeMacros(macros: MacroOp[][]): DecodedMacro[] {
  return macros.map((ops) => {
    const steps: MacroStep[] = [];
    for (const op of ops) {
      if (typeof op === "string") {
        steps.push({ kind: "letGo" });
      } else if ("Char" in op) {
        const last = steps.at(-1);
        const text = String.fromCharCode(op.Char);
        if (last?.kind === "text") last.text += text;
        else steps.push({ kind: "text", text });
      } else if ("Delay" in op) {
        steps.push({ kind: "delay", ms: op.Delay });
      } else if ("Tap" in op) {
        steps.push({ kind: "tap", action: structuredClone(op.Tap) });
      } else if ("Press" in op) {
        steps.push({ kind: "press", action: structuredClone(op.Press) });
      } else {
        steps.push({ kind: "release", action: structuredClone(op.Release) });
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
  if (first.kind === "letGo") return "wait for release";
  if (first.kind === "delay") return `delay ${first.ms}ms…`;
  const action = first.action;
  const what = plainHid(action) ?? (typeof action === "string" ? action : Object.keys(action)[0]);
  return `${first.kind} ${what}…`;
}
