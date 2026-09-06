// Host lock-LED state, pushed live by the firmware. Shown in both the live
// view's header and the device tab's connection card.

import { useWorkbench } from "../state";
import { cx } from "../kit";

export function LockIndicators({ title = "Host lock indicators, live" }: { title?: string }) {
  const { state } = useWorkbench();
  const indicator = state.ledIndicator;
  if (!indicator) return null;
  const items: Array<{ label: string; on: boolean }> = [
    { label: "Num", on: indicator.num_lock },
    { label: "Caps", on: indicator.caps_lock },
    { label: "Scroll", on: indicator.scroll_lock },
  ];
  return (
    <span className="flex items-center gap-1.5" title={title}>
      {items.map((item) => (
        <span
          key={item.label}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            item.on
              ? "border-accent-deep/60 bg-accent-dim/30 text-accent"
              : "border-line text-faint",
          )}
        >
          <span className={cx("size-1.5 rounded-full", item.on ? "bg-accent" : "bg-line-strong")} />
          {item.label}
        </span>
      ))}
    </span>
  );
}
