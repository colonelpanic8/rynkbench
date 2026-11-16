// Behavior labels against what a keyboard holds (ADR 0020): a label on a slot
// the keyboard holds nothing in is dropped (another tool cleared it). Pure.

import { withoutEmptySlots, type BehaviorLabels } from "../model/behavior-labels";
import { slotsOf } from "../operations";
import type { KeyboardImage } from "../sync";

export function labelsFor(labels: BehaviorLabels, image: KeyboardImage): BehaviorLabels {
  return withoutEmptySlots(labels, (kind, slot) => Boolean(slotsOf(image, kind)?.[slot]));
}
