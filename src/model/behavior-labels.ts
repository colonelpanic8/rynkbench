// Behavior labels (ADR 0020): a name and a description for a behavior slot.
// RMK stores numbered slots and keeps no names (a tap-hold profile's name is
// the keyboard's own), so labels live beside what you want, per kind and slot,
// and go wherever the slot's value goes. Pure.

/** The kinds the Behavior Library lists: what RMK stores as numbered slots. */
export type BehaviorKind = "macros" | "morse" | "forks" | "profiles";

export const BEHAVIOR_KINDS: readonly BehaviorKind[] = ["macros", "morse", "forks", "profiles"];

export interface BehaviorLabel {
  /** Empty: the behavior shows its kind and number. A profile's name is not here. */
  name: string;
  description: string;
}

export type BehaviorLabels = Readonly<Record<BehaviorKind, Readonly<Record<number, BehaviorLabel>>>>;

export const noLabels = (): BehaviorLabels => ({ macros: {}, morse: {}, forks: {}, profiles: {} });

export function labelAt(labels: BehaviorLabels, kind: BehaviorKind, slot: number): BehaviorLabel | undefined {
  return labels[kind][slot];
}

/** The labels with one slot's label set; an empty label (or null) removes it. */
export function withLabel(labels: BehaviorLabels, kind: BehaviorKind, slot: number, label: BehaviorLabel | null): BehaviorLabels {
  const name = label?.name.trim() ?? "";
  const description = label?.description.trim() ?? "";
  const table: Record<number, BehaviorLabel> = { ...labels[kind] };
  if (name || description) table[slot] = { name, description };
  else delete table[slot];
  return { ...labels, [kind]: table };
}

/** The names a kind's labels hold, for finding a free one. */
export function namesOf(labels: BehaviorLabels, kind: BehaviorKind): string[] {
  return Object.values(labels[kind]).map((label) => label.name).filter(Boolean);
}

/** `wanted`, or `wanted 2`, `wanted 3` … the first that no name in `taken` has (any case). */
export function freeName(wanted: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  const stem = wanted.trim();
  if (!stem || !used.has(stem.toLowerCase())) return stem;
  const base = stem.replace(/ \d+$/, "");
  for (let n = 2; ; n += 1) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** The labels without those on slots `isFilled` says are empty: what a read keeps. */
export function withoutEmptySlots(labels: BehaviorLabels, isFilled: (kind: BehaviorKind, slot: number) => boolean): BehaviorLabels {
  let next = labels;
  for (const kind of BEHAVIOR_KINDS) {
    for (const slot of Object.keys(labels[kind]).map(Number)) if (!isFilled(kind, slot)) next = withLabel(next, kind, slot, null);
  }
  return next;
}

/** Labels as kept in the browser (JSON). */
export const labelsToText = (labels: BehaviorLabels): string => JSON.stringify(labels);

/** Labels read back from the browser; anything unreadable is left out. */
export function labelsFromText(text: string | null): BehaviorLabels {
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  let labels = noLabels();
  if (typeof raw !== "object" || raw === null) return labels;
  for (const kind of BEHAVIOR_KINDS) {
    const table = (raw as Record<string, unknown>)[kind];
    if (typeof table !== "object" || table === null) continue;
    for (const [slot, value] of Object.entries(table)) {
      const { name, description } = (value ?? {}) as Partial<BehaviorLabel>;
      if (!/^\d+$/.test(slot) || (typeof name !== "string" && typeof description !== "string")) continue;
      labels = withLabel(labels, kind, Number(slot), {
        name: typeof name === "string" ? name : "",
        description: typeof description === "string" ? description : "",
      });
    }
  }
  return labels;
}
