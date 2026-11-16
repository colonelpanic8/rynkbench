// Shared building blocks for the Behaviors screens: slot write status, the
// StateBits condition editor, the combo empty-slot predicate, the centre column.

import type { ReactNode } from "react";
import type {
  ComboDefinition,
  LedIndicator,
  MouseButtons,
  StateBits,
} from "../../model/action-types";
import { comboIsEmpty as definitionIsEmpty } from "../../model/combos";
import { ModGrid } from "../keymap/ActionEditor";
import type { SlotKind } from "../../workbench";
import { slotPendingId } from "../../workbench";
import { WriteStatus } from "../write-status";
import { cx } from "../kit";

/* ------------------------------------------------------------------ */
/* Empty-slot semantics (mirror what fresh firmware reports)           */
/* ------------------------------------------------------------------ */

export function comboIsEmpty(combo: ComboDefinition): boolean {
  return definitionIsEmpty(combo);
}

/* ------------------------------------------------------------------ */
/* Slot write status line                                              */
/* ------------------------------------------------------------------ */

export function SlotStatus({ kind, index }: { kind: SlotKind; index: number }) {
  return <WriteStatus id={slotPendingId(kind, index)} />;
}

/* ------------------------------------------------------------------ */
/* StateBits condition editor                                          */
/* ------------------------------------------------------------------ */

const LED_FIELDS: Array<{ key: keyof LedIndicator; label: string }> = [
  { key: "num_lock", label: "Num" },
  { key: "caps_lock", label: "Caps" },
  { key: "scroll_lock", label: "Scroll" },
  { key: "compose", label: "Compose" },
  { key: "kana", label: "Kana" },
];

const MOUSE_FIELDS: Array<{ key: keyof MouseButtons; label: string }> = [
  { key: "button1", label: "M1" },
  { key: "button2", label: "M2" },
  { key: "button3", label: "M3" },
  { key: "button4", label: "M4" },
  { key: "button5", label: "M5" },
  { key: "button6", label: "M6" },
  { key: "button7", label: "M7" },
  { key: "button8", label: "M8" },
];

function TogglePill({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cx(
        "cursor-pointer rounded-full border px-2 py-0.5 text-small font-medium transition-colors duration-120",
        on
          ? "border-accent bg-accent-dim/40 text-accent"
          : "border-line text-faint hover:border-line-strong hover:text-mute",
      )}
    >
      {label}
    </button>
  );
}

export function StateBitsEditor({
  value,
  onChange,
}: {
  value: StateBits;
  onChange: (next: StateBits) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <ModGrid
        mods={value.modifiers}
        onChange={(modifiers) => onChange({ ...value, modifiers })}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-caption font-semibold uppercase tracking-wider text-faint">
          Lock LEDs
        </span>
        {LED_FIELDS.map((f) => (
          <TogglePill
            key={f.key}
            on={value.leds[f.key]}
            label={f.label}
            onToggle={() =>
              onChange({ ...value, leds: { ...value.leds, [f.key]: !value.leds[f.key] } })
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-caption font-semibold uppercase tracking-wider text-faint">
          Mouse
        </span>
        {MOUSE_FIELDS.map((f) => (
          <TogglePill
            key={f.key}
            on={value.mouse[f.key]}
            label={f.label}
            onToggle={() =>
              onChange({ ...value, mouse: { ...value.mouse, [f.key]: !value.mouse[f.key] } })
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card list scaffolding for the center column                         */
/* ------------------------------------------------------------------ */

export function CenterScroll({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-8">{children}</div>
    </div>
  );
}
