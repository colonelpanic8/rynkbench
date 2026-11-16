// Behaviors as text (ADR 0020): Copy writes the chosen behaviors, with their
// names and descriptions, as one JSON text; Paste (the `paste_behaviors`
// operation) reads it back. Copy changes nothing, so it is not an operation.
// Pure.

import { BEHAVIOR_KINDS, type BehaviorKind } from "../model/behavior-labels";
import type { AnyBehavior } from "./behavior-slots";

/** One copied behavior: its kind, value and label. */
export type CopiedBehavior = AnyBehavior & { name: string; description: string };

const MARK = "rynkbench.behaviors";

export function behaviorsAsText(items: readonly CopiedBehavior[]): string {
  return JSON.stringify({ format: MARK, version: 1, items }, null, 2);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Whether a value has the shape its kind stores (enough to be written, not a full check). */
function fits(kind: BehaviorKind, value: unknown): boolean {
  switch (kind) {
    case "macros":
      return Array.isArray(value) && value.length > 0;
    case "morse":
      return isObject(value) && Array.isArray(value.actions) && value.actions.length > 0 && isObject(value.profile);
    case "forks":
      return isObject(value) && "trigger" in value && "positive_output" in value && "negative_output" in value;
    case "profiles":
      return isObject(value);
  }
}

/** The behaviors a text holds, or why it holds none. */
export function behaviorsFromText(text: string): CopiedBehavior[] | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "The clipboard holds no behaviors";
  }
  if (!isObject(raw) || raw.format !== MARK || !Array.isArray(raw.items)) return "The clipboard holds no behaviors";
  const items: CopiedBehavior[] = [];
  for (const item of raw.items) {
    if (!isObject(item) || !BEHAVIOR_KINDS.includes(item.kind as BehaviorKind) || !fits(item.kind as BehaviorKind, item.value)) {
      return "A copied behavior could not be read";
    }
    items.push({
      kind: item.kind,
      value: item.value,
      name: typeof item.name === "string" ? item.name : "",
      description: typeof item.description === "string" ? item.description : "",
    } as CopiedBehavior);
  }
  return items.length > 0 ? items : "The clipboard holds no behaviors";
}
