// Shared building blocks for the advanced editors: slot write status,
// KeyAction slot buttons, StateBits condition editor, empty-slot predicates.

import type { ReactNode } from "react";
import type {
  Combo,
  Fork,
  KeyAction,
  LedIndicator,
  Morse,
  MouseButtons,
  StateBits,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { EMPTY_MODS, keyActionGlyph } from "../labels";
import { ModGrid } from "../keymap/ActionEditor";
import type { PendingInfo, SlotKind } from "../state";
import { slotPendingId, useWorkbench } from "../state";
import { cx } from "../kit";
import { WarningIcon } from "../icons";

/* ------------------------------------------------------------------ */
/* Empty-slot semantics (mirror what fresh firmware reports)           */
/* ------------------------------------------------------------------ */

export function comboIsEmpty(combo: Combo): boolean {
  return combo.output === "No" && combo.actions.length === 0;
}

export function morseIsEmpty(morse: Morse): boolean {
  return morse.actions.length === 0;
}

export function forkIsEmpty(fork: Fork): boolean {
  return fork.trigger === "No";
}

export const EMPTY_LEDS: LedIndicator = {
  num_lock: false,
  caps_lock: false,
  scroll_lock: false,
  compose: false,
  kana: false,
};

export const EMPTY_MOUSE: MouseButtons = {
  button1: false,
  button2: false,
  button3: false,
  button4: false,
  button5: false,
  button6: false,
  button7: false,
  button8: false,
};

export function emptyStateBits(): StateBits {
  return { modifiers: { ...EMPTY_MODS }, leds: { ...EMPTY_LEDS }, mouse: { ...EMPTY_MOUSE } };
}

export function anyStateBits(bits: StateBits): boolean {
  return (
    Object.values(bits.modifiers).some(Boolean) ||
    Object.values(bits.leds).some(Boolean) ||
    Object.values(bits.mouse).some(Boolean)
  );
}

/* ------------------------------------------------------------------ */
/* Slot write status line                                              */
/* ------------------------------------------------------------------ */

export function SlotStatus({ kind, index }: { kind: SlotKind; index: number }) {
  const { state, dispatch } = useWorkbench();
  const pending: PendingInfo | undefined = state.pending[slotPendingId(kind, index)];
  if (!pending) return null;
  if (pending.status === "pending") {
    return <div className="text-[11.5px] text-accent">Writing to device…</div>;
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-dim/25 px-3 py-2 text-[12px] text-danger">
      <WarningIcon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div>Write failed: {pending.message}</div>
        <button
          type="button"
          className="mt-1 cursor-pointer text-mute underline underline-offset-2"
          onClick={() => dispatch({ type: "slotErrDismiss", kind, index })}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KeyAction slot button (trigger / output pickers)                    */
/* ------------------------------------------------------------------ */

export function ActionSlotButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: KeyAction;
  active: boolean;
  onClick: () => void;
}) {
  const glyph = keyActionGlyph(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-colors duration-120",
        active ? "border-accent bg-accent-dim/30" : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </span>
      <span
        className={cx(
          "max-w-full truncate font-mono text-[13px]",
          glyph.text ? "text-ink" : "text-faint",
        )}
      >
        {glyph.text || "unset"}
        {glyph.sub ? ` / ${glyph.sub}` : ""}
      </span>
    </button>
  );
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
        "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-120",
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
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
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
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
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

export function SlotCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors duration-120",
        selected
          ? "border-accent-deep bg-accent-dim/20"
          : "border-line-soft bg-panel hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}
