// What stops a fork (a key that becomes another while something is held) from
// being applied in its editor (ADR 0020). Pure.

import type { Fork, StateBits } from "../vendor/rynk-wasm/rynk_wasm";

export function anyStateBits(bits: StateBits): boolean {
  return Object.values(bits.modifiers).some(Boolean) || Object.values(bits.leds).some(Boolean) || Object.values(bits.mouse).some(Boolean);
}

export function forkProblem(fork: Fork): string | null {
  if (fork.trigger === "No") return "Pick the key it changes";
  if (fork.positive_output === "No") return "Pick what it becomes";
  if (!anyStateBits(fork.match_any)) return "Pick what makes it change";
  return null;
}
