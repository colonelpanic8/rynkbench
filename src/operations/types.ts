// What an operation is (ADR 0019): a named, pure function from one keyboard
// image to another, with typed inputs described as data. It reads nothing,
// writes nothing and asks nothing; the workbench applies its result (one
// commit, judged by Guard, one Undo step).

import type { LightingConditionalSceneCell, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";

/** What the keyboard is but does not store: what an operation may need besides the image. */
export interface OperationFacts {
  /** Matrix columns: a key's offset in its layer is `row * cols + col`. */
  cols: number;
  /** How many scene cells and rules the keyboard holds; null when it has no such table. */
  sceneCapacity: number | null;
  ruleCapacity: number | null;
  /** The layers on now, besides the default one; a layer cannot move while it is on. */
  activeLayers: readonly number[];
  /** Lighting built into the firmware: it cannot move with a layer. */
  compiledScenes: readonly LightingSceneCell[];
  compiledRules: readonly LightingConditionalSceneCell[];
  /** Which half of a split board each LED is on (0 or 1); absent means 0. */
  ledNodes: Readonly<Record<number, number>>;
}

/** The kinds of input an operation takes; `value` is any stored value (a key action, a light). */
export type InputKind = "integer" | "string" | "boolean" | "choice" | "value";

/** One input field, described for a person or an assistant reading the catalog. */
export interface InputField {
  name: string;
  kind: InputKind;
  description: string;
  /** A list of this kind rather than one. */
  list?: true;
  optional?: true;
  /** For integers. */
  min?: number;
  /** For choices. */
  values?: readonly string[];
}

export type OperationResult =
  | {
      ok: true;
      image: KeyboardImage;
      /** A layer rewrite: destination slot → source slot, so the layer on show can follow. */
      layerOrder?: number[];
    }
  | { ok: false; message: string };

export interface Operation<Input> {
  name: string;
  /** One sentence: what it changes. */
  description: string;
  inputs: readonly InputField[];
  run(image: KeyboardImage, input: Input, facts: OperationFacts): OperationResult;
}

export const failed = (message: string): OperationResult => ({ ok: false, message });

/** The message of an error a planner threw. */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
