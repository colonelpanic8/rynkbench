import { describe, expect, it } from "vitest";
import type { MorseProfile } from "../vendor/rynk-wasm/rynk_wasm";
import { morseProfileSummary } from "./morse-profile";

const profile = (overrides: Partial<MorseProfile>): MorseProfile => ({
  unilateral_tap: undefined,
  opposite_hand_hold: undefined,
  enable_flow_tap: undefined,
  mode: undefined,
  hold_timeout_ms: undefined,
  gap_timeout_ms: undefined,
  quick_tap_timeout_ms: undefined,
  retro_tap: undefined,
  prior_idle_time_ms: undefined,
  hold_trigger_on_release: undefined,
  ...overrides,
});

describe("morse profile summaries", () => {
  it("calls out geometry-driven opposite-hand holds", () => {
    expect(
      morseProfileSummary(profile({ hold_timeout_ms: 180, opposite_hand_hold: true })),
    ).toBe("180 ms hold · opposite-hand hold");
  });
});
