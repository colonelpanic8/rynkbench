// A key's slots in the key editor, as in GLIDE: On Tap always, On Hold and On
// Double Tap when set, else a chip that adds them. The slot being filled is
// marked; the tabs beside the list fill it. A slot's handle drags it onto
// another slot to swap their actions (model/key-slots.ts swapSlots).

import type { Action } from "../../model/action-types";
import type { Slot, SlotsOf } from "../../model/key-slots";
import { DEFAULT_TAP_HOLD_PROFILE } from "../../model/morse";
import type { ConnectedBundle } from "../../model/workbench-state";

import { cx } from "../kit";
import { GripIcon, TrashIcon } from "../icons";
import { morseProfileSummary } from "../morse-profile";
import { useKeyText } from "../useKeyText";
import { useRowDrag } from "../sidepanel/useRowDrag";

const SLOTS: readonly Slot[] = ["tap", "hold", "doubleTap"];

const SLOT_NAME: Record<Slot, string> = { tap: "On Tap", hold: "On Hold", doubleTap: "On Double Tap" };

const CLEAR_HINT: Record<Slot, string> = {
  tap: "Clear the tap",
  hold: "Remove the hold",
  doubleTap: "Remove the double tap",
};

const PICK_HINT: Record<Slot, string> = {
  tap: "Pick what the key does →",
  hold: "Pick what the key does when held →",
  doubleTap: "Pick what the key does when pressed twice →",
};

/** A slot as GLIDE draws it: one row, its name on the left, what it does on the
 *  right, and a bin. The whole row picks it as the slot the tabs fill. */
function SlotRow({
  slot,
  value,
  active,
  drag,
  onSelect,
  onClear,
}: {
  slot: Slot;
  value: Action;
  active: boolean;
  /** Its handle, and whether it is being dragged or is where a dragged slot would land. */
  drag: { handle: ReturnType<ReturnType<typeof useRowDrag>["handle"]>; lifted: boolean; over: boolean } | null;
  onSelect: () => void;
  onClear: () => void;
}) {
  const keyText = useKeyText();
  const empty = value === "No";
  return (
    <div
      data-row={SLOTS.indexOf(slot)}
      className={cx(
        "flex h-[42px] items-center gap-1.5 rounded-xl border pr-3 transition-colors",
        active ? "border-accent bg-accent-dim" : "border-line bg-raised hover:border-line-strong",
        drag?.lifted && "border-dashed opacity-40",
        drag?.over && "ring-2 ring-accent",
      )}
    >
      {drag ? (
        <span
          {...drag.handle}
          title="Drag onto another action to swap"
          className="-mr-1.5 flex h-full shrink-0 cursor-grab items-center pr-1 pl-3 text-ink opacity-70 select-none hover:opacity-100"
        >
          <GripIcon size={12} />
        </span>
      ) : (
        <span className="w-1.5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
      >
        <span className="shrink-0 pl-1.5 text-body font-semibold text-ink">{SLOT_NAME[slot]}:</span>
        <span
          className={cx(
            "ml-auto truncate pr-2 font-semibold",
            empty ? "text-small text-faint" : "font-mono text-small text-ink",
          )}
        >
          {empty ? "Pick an action →" : keyText.label(value) || keyText.describeAction(value)}
        </span>
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${SLOT_NAME[slot]}`}
        title={CLEAR_HINT[slot]}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border border-accent/15 text-accent hover:bg-accent-dim"
      >
        <TrashIcon size={14} />
      </button>
    </div>
  );
}

export function SlotList({
  slots,
  active,
  offerDoubleTap,
  profiles,
  onSelect,
  onClear,
  onSwap,
  onProfile,
}: {
  slots: SlotsOf;
  active: Slot;
  /** The keyboard can do a double tap (capability `keys.doubleTap`). */
  offerDoubleTap: boolean;
  profiles: ConnectedBundle["morseProfiles"];
  onSelect: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
  /** Swap two slots' actions (a slot dragged by its handle onto another). */
  onSwap: (from: Slot, to: Slot) => void;
  onProfile: (profile: number) => void;
}) {
  const rows = useRowDrag((from, to) => onSwap(SLOTS[from], SLOTS[to]));
  const extra: Array<Exclude<Slot, "tap">> = offerDoubleTap ? ["hold", "doubleTap"] : ["hold"];
  const set = extra.filter((slot) => slots[slot] !== null);
  const unset = extra.filter((slot) => slots[slot] === null);
  const shown = 1 + set.length;
  const row = (slot: Slot, value: Action) => (
    <SlotRow
      key={slot}
      slot={slot}
      value={value}
      active={active === slot}
      drag={
        shown > 1
          ? {
              handle: rows.handle(SLOTS.indexOf(slot)),
              lifted: rows.drag?.from === SLOTS.indexOf(slot),
              over: rows.drag !== null && rows.drag.over === SLOTS.indexOf(slot) && rows.drag.from !== rows.drag.over,
            }
          : null
      }
      onSelect={() => onSelect(slot)}
      onClear={() => onClear(slot)}
    />
  );

  return (
    <>
      {row("tap", slots.tap)}
      {set.map((slot) => row(slot, slots[slot]!))}
      {/* A morse-backed key keeps its timing in its morse entry. */}
      {slots.hold !== null && slots.morse === null && (
        <label className="flex flex-col gap-1 text-small text-faint">
          Hold timing
          <select
            value={slots.profile}
            onChange={(event) => onProfile(Number(event.target.value))}
            className="rounded-lg border border-line bg-raised px-2 py-1.5 text-body text-ink"
          >
            <option value={DEFAULT_TAP_HOLD_PROFILE}>The keyboard's default</option>
            {profiles.map((entry) => (
              <option key={entry.index} value={entry.index}>
                {entry.name} · {morseProfileSummary(entry.profile)}
              </option>
            ))}
          </select>
        </label>
      )}
      {unset.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unset.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(slot)}
              aria-pressed={active === slot}
              className={cx(
                "flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-small leading-4 font-semibold transition-colors",
                active === slot ? "border-accent text-accent" : "border-line-strong text-ink hover:border-mute",
              )}
            >
              <span className="text-accent">+</span> {SLOT_NAME[slot]}
            </button>
          ))}
        </div>
      )}
      {slots[active] === null && <p className="text-small text-accent">{PICK_HINT[active]}</p>}
    </>
  );
}
