// The writer (ADR 0012, docs/sync.md): sends a plan through the session
// interface, in order, and stops at the first failure. It keeps no record of
// how far it got: planning again against a fresh read gives what is left, so
// a failure, a dropped link or a closed tab all resume the same way.

import type { RynkSession } from "../session/types";
import type { KeyboardImage } from "./image";
import { planSync, storedItems, type SyncStep } from "./plan";
import { partsOf, readImage, type ImageFeatures, type ReadImage } from "./read";

/** A write that stopped part-way: the cause's message, how many steps went through, and which one failed. */
export class SyncStopped extends Error {
  readonly done: number;
  readonly total: number;
  readonly step: SyncStep;

  constructor(done: number, total: number, step: SyncStep, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "SyncStopped";
    this.done = done;
    this.total = total;
    this.step = step;
  }
}

async function writeStep(session: RynkSession, step: SyncStep): Promise<void> {
  switch (step.kind) {
    case "slot":
      if (step.table === "combos") return session.combos.set(step.index, step.value);
      if (step.table === "morse") return session.morse.set(step.index, step.value);
      return session.forks.set(step.index, step.value);
    case "macros":
      return session.macros.write(step.value);
    case "layerMetadata":
      return session.keymap.setLayerMetadata(step.layer, step.value);
    case "keys":
      return session.keymap.setRows(step.layer, step.row, step.actions);
    case "encoder":
      return session.keymap.setEncoder(step.id, step.layer, step.action);
    case "defaultLayer":
      return session.keymap.setDefaultLayer(step.layer);
    case "behaviorOptions":
      return session.behavior.setOptions(step.value);
    case "autoMouseLayers":
      return session.behavior.setAutoMouseLayers(step.value);
    case "pointing": {
      const current = await session.pointing.get();
      await session.pointing.set({ ...step.value, revision: current.revision });
      return;
    }
    case "wakeLayers":
      await session.lighting.setWakeLayers(step.value);
      return;
    case "scenes":
      await session.lighting.scenes.replaceScenes(step.value);
      return;
    case "rules":
      await session.lighting.conditionalScenes.replace(step.value);
      return;
    case "behavior":
      return session.behavior.set(step.value);
    case "morseProfile":
      return step.value ? session.behavior.setProfile(step.value) : session.behavior.deleteProfile(step.index);
    case "holdTriggerPositions":
      return session.behavior.setHoldTriggerPositions(step.value);
    case "layerPolicy":
      await session.lighting.scenes.setLayerPolicy(step.value);
      return;
    case "lightingState":
      await session.lighting.setState(step.value);
      return;
    case "extension":
      await session.lighting.setExtensionState(step.value);
      return;
    case "extensionOverlay":
      await session.lighting.setExtensionLayers(step.value ?? undefined);
      return;
    case "effectParam":
      await session.lighting.setExtensionParam(step.effect, step.index, step.value);
      return;
  }
}

/** Writes the steps in order; throws `SyncStopped` at the first that fails. */
export async function writePlan(
  session: RynkSession,
  steps: readonly SyncStep[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let done = 0; done < steps.length; done += 1) {
    try {
      await writeStep(session, steps[done]);
    } catch (error) {
      throw new SyncStopped(done, steps.length, steps[done], error);
    }
    onProgress?.(done + 1, steps.length);
  }
}

export interface SyncResult {
  /** What the keyboard holds after writing, read back. */
  readback: ReadImage;
  /** Flash items stored by this sync (a key row counts its segments). */
  stored: number;
}

/** Brings the keyboard to `want`: plans against `now` (a fresh read), writes,
 *  reads back once and checks that nothing planned is left. */
export async function syncTo(
  session: RynkSession,
  now: KeyboardImage,
  want: KeyboardImage,
  features: ImageFeatures,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const { num_cols: cols } = await session.device.capabilities();
  const steps = planSync(now, want, cols);
  await writePlan(session, steps, onProgress);
  const readback = await readImage(session, { ...features, ...partsOf(want) });
  const left = planSync(readback, want, cols);
  if (left.length > 0) {
    throw new Error(`the keyboard holds something else for ${storedItems(left)} item(s) after writing; try again`);
  }
  return { readback, stored: storedItems(steps) };
}
