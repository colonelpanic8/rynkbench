// How much of the keyboard's shared macro space the macros take with this one
// as it is now: a bar that turns red past the limit.

import { SectionLabel, cx } from "../../kit";

export function MacroSpace({ used, bytes, compact = false }: { used: number; bytes: number; compact?: boolean }) {
  const over = used > bytes;
  const count = (
    <span className={cx("tnum", compact ? "text-small" : "text-body", over ? "text-danger" : "text-mute")}>
      {used} / {bytes} bytes
    </span>
  );
  return (
    <div data-testid="macro-space" className={cx("flex flex-col", compact ? "gap-1 px-1 pt-1" : "gap-2")}>
      <div className="flex items-baseline justify-between">
        {compact ? <span className="text-small text-faint">Macro space</span> : <SectionLabel>Macro space</SectionLabel>}
        {count}
      </div>
      <div className={cx("overflow-hidden rounded-full bg-well", compact ? "h-1" : "h-1.5")}>
        <div className={cx("h-full rounded-full", over ? "bg-danger" : "bg-accent-deep")} style={{ width: `${Math.min(100, (used / Math.max(1, bytes)) * 100)}%` }} />
      </div>
    </div>
  );
}
