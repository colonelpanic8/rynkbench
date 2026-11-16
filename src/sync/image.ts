// What Rynkbench knows a keyboard stores: one record per kind of stored item.
// The planner compares two of these (what the keyboard holds, what you want);
// a part that is missing on either side is simply not compared (ADR 0012).

import type {
  AutoMouseLayerConfig,
  BehaviorConfig,
  BehaviorOptions,
  ComboDefinition,
  EncoderAction,
  Fork,
  KeyAction,
  LightingExtensionState,
  LightingLayerPolicy,
  LightingMutableState,
  LightingSceneCell,
  MacroOp,
  Morse,
  MorseHoldTriggerPosition,
  MorseProfileEntry,
  PointingConfig,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { LayerMetadata, RuntimeLightingRule } from "../session/types";

export interface KeyboardImage {
  /** Per layer slot: used or not, and its name. Empty when the firmware keeps none. */
  metadata: LayerMetadata[];
  /** Per layer, row-major. */
  layers: KeyAction[][];
  /** Per layer, per encoder. */
  encoders: EncoderAction[][];
  defaultLayer: number;
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  /** The macro region, one entry per macro; absent when it was not read. */
  macroOps?: MacroOp[][];
  behaviorOptions: BehaviorOptions | null;
  autoMouseLayers: AutoMouseLayerConfig[];
  scenes: LightingSceneCell[];
  runtimeConditionalScenes: RuntimeLightingRule[];
  wakeLayers: number;
  pointing: PointingConfig | null;
  // The parts below are absent when the keyboard has none (or they were not
  // read); an absent part is not compared and not written (ADR 0018).
  /** The keyboard-wide timings. */
  behavior?: BehaviorConfig;
  /** Morse (tap-hold) profiles by slot; null for an empty slot. */
  morseProfiles?: (MorseProfileEntry | null)[];
  holdTriggerPositions?: MorseHoldTriggerPosition[];
  /** How layer scenes combine. */
  layerPolicy?: LightingLayerPolicy;
  /** The live lighting controls: on or off, brightness, the background. */
  lightingState?: LightingMutableState;
  /** The firmware's effect, palette, value and speed. */
  extension?: LightingExtensionState;
  /** The second (overlay) effect; null for none. Absent without effect layering. */
  extensionOverlay?: number | null;
  /** Each read effect's parameter values, in the firmware's order. */
  effectParams?: Record<number, number[]>;
}

export type SlotTable = "combos" | "morse" | "forks";
