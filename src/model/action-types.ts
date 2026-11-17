// The key-action types screens use, named once here so that new screens never
// import the generated wire package (src/architecture/boundaries.ts). Today
// they are RMK's shapes; a second protocol changes this file, not the screens.

export type {
  Action,
  /** The keyboard-wide timings (combo, one-shot, tap intervals). */
  BehaviorConfig,
  /** A combo: keys pressed together and what they do. */
  ComboDefinition,
  EncoderAction,
  /** A key that becomes another while certain modifiers are held. */
  Fork,
  HidKeyCode,
  KeyAction,
  KeyboardAction,
  KeyCode,
  /** A held-LED condition a fork can test (Caps Lock …). */
  LedIndicator,
  LightAction,
  /** One step of a macro as the keyboard stores it. */
  MacroOp,
  /** Where a key sits in the matrix. */
  MatrixPosition,
  ModifierCombination,
  /** A morse (tap-dance) entry a key can be bound to. */
  Morse,
  /** How a morse entry decides between tap and hold, and its timing. */
  MorseMode,
  MorseProfile,
  /** A named tap-hold timing profile in its slot. */
  MorseProfileEntry,
  MouseButtons,
  /** The modifier, LED and mouse state a fork matches. */
  StateBits,
  /** A pointing device's layer modes: cursor, caret keys and their settings. */
  CaretConfig,
  CursorConfig,
  PointingConfig,
  PointingMode,
} from "../vendor/rynk-wasm/rynk_wasm";
