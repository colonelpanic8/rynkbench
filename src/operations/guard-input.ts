// Guard's view of an image (ADR 0019): the layout `judgeChange` takes, read
// from a `KeyboardImage`, so any operation's result is judged like a key. Pure.

import type { GuardInput } from "../domain";
import { decodeMacros } from "../model/macros";
import type { KeyboardImage } from "../sync/image";

export function guardInputOf(image: KeyboardImage, cols: number): GuardInput {
  return {
    defaultLayer: image.defaultLayer,
    source: {
      layers: image.layers,
      cols,
      combos: image.combos,
      morse: image.morse,
      forks: image.forks,
      macroCount: decodeMacros(image.macroOps ?? []).length,
      profileSlots: (image.morseProfiles ?? []).flatMap((entry) => (entry ? [entry.index] : [])),
    },
  };
}
