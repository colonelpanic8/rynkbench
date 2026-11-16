// The one big on/off that leads a Layout properties tab (RGB Lighting's
// lights, RGB Effects' effects): its name, one line on what it is now, and a
// switch. Everything below it greys out while it is off.

import { cx } from "../kit";

export function BigSwitch({ name, state, on, onChange }: {
  name: string;
  /** One line on what is on now, or what off means. */
  state: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        on ? "border-accent bg-accent-dim" : "border-line-strong hover:border-mute",
      )}
    >
      <span className="min-w-0">
        <span className="block text-ui font-semibold text-ink">{name}</span>
        <span className="block truncate text-small text-mute">{state}</span>
      </span>
      <span className={cx("flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-accent-fill" : "bg-line-strong")}>
        <span className={cx("size-4 rounded-full bg-panel transition-transform", on && "translate-x-4")} />
      </span>
    </button>
  );
}
