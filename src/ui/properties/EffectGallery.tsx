// The firmware's effects as a gallery of cards for one slot (the effect, or
// the effect over it): a wrapping grid of buttons, the one filling the slot
// pressed. Names and numbers are the firmware's own.

import { useId } from "react";
import { cx } from "../kit";

function EffectCard({ name, number, chosen, onPick }: {
  name: string;
  /** The firmware's number for the effect; none on the card that empties the slot. */
  number?: number;
  chosen: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      title={number === undefined ? undefined : `Effect ${number} · ${name}`}
      onClick={onPick}
      className={cx(
        "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed",
        chosen ? "border-accent bg-accent-dim text-ink" : "border-line-strong text-mute enabled:hover:border-mute enabled:hover:text-ink",
      )}
    >
      <span className={cx("flex size-3 shrink-0 items-center justify-center rounded-full border", chosen ? "border-accent" : "border-mute")}>
        {chosen && <span className="size-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-semibold">{name}</span>
      {number !== undefined && <span className="tnum shrink-0 text-caption text-faint">#{number}</span>}
    </button>
  );
}

export function EffectGallery({ label, names, value, onPick, empty }: {
  label: string;
  names: string[];
  /** The effect filling the slot; undefined while the slot is empty. */
  value: number | undefined;
  onPick: (effect: number) => void;
  /** For a slot that may stay empty: the card that empties it. */
  empty?: { name: string; onPick: () => void };
}) {
  const heading = useId();
  if (names.length === 0) return null;
  return (
    <div role="group" aria-labelledby={heading} className="flex flex-col gap-1.5">
      <span id={heading} className="text-body text-mute">
        {label}
      </span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
        {empty && <EffectCard name={empty.name} chosen={value === undefined} onPick={empty.onPick} />}
        {names.map((name, index) => (
          <EffectCard key={index} name={name} number={index} chosen={value === index} onPick={() => onPick(index)} />
        ))}
      </div>
    </div>
  );
}
