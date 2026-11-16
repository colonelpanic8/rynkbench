// Rynkbench Guard's label: the same mark wherever Guard speaks (asks, stops,
// fixes), so people learn to recognise it (ADR 0011).

import { ShieldIcon } from "../icons";

export function GuardLabel() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold uppercase tracking-widest text-accent">
      <ShieldIcon size={12} />
      Rynkbench Guard
    </span>
  );
}
