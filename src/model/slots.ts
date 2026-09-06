// What fresh firmware reports for an unprogrammed slot or a cleared state
// word. The editors need these to recognize an empty slot and to seed a new
// one; the simulated boards need them to *be* fresh firmware. One definition
// keeps the two from disagreeing when the wire shape gains a field.

import type {
  ComboDefinition,
  Fork,
  LedIndicator,
  ModifierCombination,
  Morse,
  MorseProfile,
  MouseButtons,
  StateBits,
} from "../vendor/rynk-wasm/rynk_wasm";

export function noModifiers(): ModifierCombination {
  return {
    left_ctrl: false,
    left_shift: false,
    left_alt: false,
    left_gui: false,
    right_ctrl: false,
    right_shift: false,
    right_alt: false,
    right_gui: false,
  };
}

export function noLeds(): LedIndicator {
  return { num_lock: false, caps_lock: false, scroll_lock: false, compose: false, kana: false };
}

export function noMouse(): MouseButtons {
  return {
    button1: false,
    button2: false,
    button3: false,
    button4: false,
    button5: false,
    button6: false,
    button7: false,
    button8: false,
  };
}

/** Zero state bits: match nothing (the wire default for fork conditions). */
export function noStateBits(): StateBits {
  return { modifiers: noModifiers(), leds: noLeds(), mouse: noMouse() };
}

export function emptyCombo(): ComboDefinition {
  return { Actions: { actions: [], output: "No", layer: undefined } };
}

export function emptyMorseProfile(): MorseProfile {
  return {
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
  };
}

export function emptyMorse(): Morse {
  return { profile: emptyMorseProfile(), actions: [] };
}

export function emptyFork(): Fork {
  return {
    trigger: "No",
    negative_output: "No",
    positive_output: "No",
    match_any: noStateBits(),
    match_none: noStateBits(),
    kept_modifiers: noModifiers(),
    bindable: true,
  };
}
