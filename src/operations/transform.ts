// Transforms: the Ctrl ↔ GUI swap and the switch between alpha layouts, over
// keys, combos, morse, forks and macros (model/transforms.ts plans them). Pure.

import type { KeyboardImage } from "../sync/image";
import {
  planLayoutSwitch,
  planOsSwap,
  type AlphaLayout,
  type LayerMigration,
  type TransformInput,
  type TransformPlan,
} from "../model/transforms";
import { withKeys } from "./keys";
import { failed, type Operation } from "./types";

export type TransformChoice =
  | { transform: "ctrl-gui-swap" }
  | { transform: "alpha-layout"; from: AlphaLayout; to: AlphaLayout; migrations: readonly LayerMigration[] };

const ALPHA_LAYOUTS = ["qwerty", "colemak", "colemak-dh", "dvorak"] as const satisfies readonly AlphaLayout[];
const MIGRATIONS = ["positional", "alphas", "mnemonic"] as const satisfies readonly LayerMigration[];

/** What a transform reads of an image. */
export function transformInputOf(image: KeyboardImage, cols: number): TransformInput {
  return { layers: image.layers, cols, combos: image.combos, morse: image.morse, forks: image.forks, macroOps: image.macroOps ?? [] };
}

/** What a transform would change, for a preview. */
export function planTransform(image: KeyboardImage, cols: number, choice: TransformChoice): TransformPlan {
  const input = transformInputOf(image, cols);
  return choice.transform === "ctrl-gui-swap"
    ? planOsSwap(input)
    : planLayoutSwitch(input, choice.from, choice.to, [...choice.migrations], image.defaultLayer);
}

/** The image with a transform's plan done. */
export function withPlan(image: KeyboardImage, cols: number, plan: TransformPlan): KeyboardImage | string {
  const keyed = withKeys(image, cols, plan.keys.map(({ after, ...place }) => ({ ...place, action: after })));
  if (typeof keyed === "string") return keyed;
  const slots = <T,>(table: readonly T[], edits: readonly { index: number; after: T }[]) => {
    const next = [...table];
    for (const { index, after } of edits) next[index] = after;
    return next;
  };
  return {
    ...keyed,
    combos: plan.combos.length ? slots(image.combos, plan.combos) : image.combos,
    morse: plan.morse.length ? slots(image.morse, plan.morse) : image.morse,
    forks: plan.forks.length ? slots(image.forks, plan.forks) : image.forks,
    macroOps: plan.macroOps ?? image.macroOps,
  };
}

export const applyTransform: Operation<TransformChoice> = {
  name: "apply_transform",
  description: "Rewrites every binding: swaps Ctrl and GUI, or switches the letters from one alpha layout to another.",
  inputs: [
    { name: "transform", kind: "choice", values: ["ctrl-gui-swap", "alpha-layout"], description: "Which transform." },
    { name: "from", kind: "choice", values: ALPHA_LAYOUTS, optional: true, description: "For alpha-layout: the layout now." },
    { name: "to", kind: "choice", values: ALPHA_LAYOUTS, optional: true, description: "For alpha-layout: the layout wanted." },
    {
      name: "migrations",
      kind: "choice",
      values: MIGRATIONS,
      list: true,
      optional: true,
      description: "For alpha-layout, per layer: positional (left alone), alphas (letters swapped) or mnemonic (bindings follow their letter).",
    },
  ],
  run(image, choice, facts) {
    if (choice.transform === "alpha-layout" && (!choice.from || !choice.to || !choice.migrations)) {
      return failed("An alpha-layout switch needs from, to and a migration per layer");
    }
    const next = withPlan(image, facts.cols, planTransform(image, facts.cols, choice));
    return typeof next === "string" ? failed(next) : { ok: true, image: next };
  },
};
