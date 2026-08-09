import type { MorseProfile } from "../vendor/rynk-wasm/rynk_wasm";

export function morseProfileSummary(profile: MorseProfile): string {
  const parts: string[] = [];
  if (profile.hold_timeout_ms !== undefined) parts.push(`${profile.hold_timeout_ms} ms hold`);
  if (profile.prior_idle_time_ms !== undefined) parts.push(`${profile.prior_idle_time_ms} ms idle`);
  if (profile.mode !== undefined) parts.push(profile.mode.replace(/([a-z])([A-Z])/g, "$1 $2"));
  if (profile.opposite_hand_hold === true) parts.push("opposite-hand hold");
  if (profile.unilateral_tap === true) parts.push("unilateral tap");
  if (profile.enable_flow_tap === true) parts.push("flow tap");
  return parts.join(" · ") || "inherits global defaults";
}
