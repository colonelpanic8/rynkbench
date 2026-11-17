// What a number field does with what is typed (NumberField in EffectEditor.tsx).
// Each whole number within bounds is reported as it is typed (`onInput`); the
// value is committed once it settles: after a pause, on Enter, or on leaving
// the field, where it is first brought within the bounds. Commits run one at a
// time, so a later one waits for an earlier one to land. A refused commit
// leaves what was typed in the field.

import { typedWithin } from "../../model/lighting/effect";

/** How long typing pauses before the number is committed. */
export const SETTLE_PAUSE_MS = 700;

export interface NumberEntryOptions {
  min?: number;
  max?: number;
  /** The value the field holds now. */
  value: number;
  onInput?: (value: number) => void;
  /** Commits a settled value; false, or a promise of false, when it was refused. */
  commit: (value: number) => unknown;
  /** What the field shows: the text typed, or null for its value. */
  show: (text: string | null) => void;
}

export type Settle = "pause" | "enter" | "leave";

export function numberEntry(options: () => NumberEntryOptions) {
  let text: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const show = (next: string | null) => {
    text = next;
    options().show(next);
  };
  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function settle(how: Settle): Promise<void> {
    stopTimer();
    const typed = text;
    const { min, max } = options();
    const n = typed === null ? null : typedWithin(typed, min, max);
    if (n === null) {
      if (how === "leave") show(null);
      return;
    }
    if (how !== "pause" && String(n) !== typed) show(String(n));
    const run = queue.then(async () => n === options().value || (await options().commit(n)) !== false);
    queue = run.catch(() => undefined);
    const ok = await run.catch(() => false);
    if (ok && how === "leave" && text === String(n)) show(null);
  }

  return {
    type(next: string) {
      show(next);
      stopTimer();
      const { min, max, onInput } = options();
      const n = typedWithin(next, min, max);
      if (n === null || n !== Number(next)) return;
      onInput?.(n);
      timer = setTimeout(() => void settle("pause"), SETTLE_PAUSE_MS);
    },
    settle,
    /** The field goes away: a number waiting for its pause is committed now. */
    dispose() {
      if (timer !== null) void settle("leave");
    },
  };
}
