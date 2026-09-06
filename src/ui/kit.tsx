// Shared chrome primitives — one visual language for panels, chips, buttons.

import { useLayoutEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { SpinnerIcon, WarningIcon } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl border border-line-soft bg-panel", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "ok";
  className?: string;
}) {
  const tones = {
    neutral: "border-line text-mute",
    accent: "border-accent-deep/60 text-accent bg-accent-dim/30",
    danger: "border-danger/50 text-danger bg-danger-dim/30",
    ok: "border-ok/40 text-ok",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";

export function Button({
  variant = "outline",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-well font-semibold hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100",
    ghost: "text-mute hover:text-ink hover:bg-hover disabled:opacity-40",
    outline:
      "border border-line text-ink hover:border-line-strong hover:bg-raised disabled:opacity-40",
    danger:
      "border border-danger/50 text-danger hover:bg-danger-dim/40 disabled:opacity-40",
  };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150 disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-line bg-well px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint",
        "transition-colors duration-150 focus:border-accent-deep",
        className,
      )}
      {...rest}
    />
  );
}

/** The contextual inspector shell — a right column on wide viewports,
 *  stacked under the canvas on narrow ones. */
export function InspectorShell({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-line-soft bg-panel p-4 max-lg:min-h-[240px] lg:w-[330px]">
      {children}
    </aside>
  );
}

export function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[12.5px] text-mute">{label}</span>
      <span className={cx("tnum text-right text-[12.5px] text-ink", mono && "font-mono")}>
        {children}
      </span>
    </div>
  );
}

export interface SegmentedItem<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

/** The pill-shaped exclusive choice used by every brush, mode and kind picker.
 *  `fit` sizes segments to their labels instead of sharing the width equally;
 *  `grid3` wraps them into three columns. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  layout = "fill",
  className,
}: {
  items: readonly SegmentedItem<T>[];
  /** null selects nothing — the device has not told us which segment holds. */
  value: T | null;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  layout?: "fill" | "fit" | "grid3";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-line-soft bg-well p-0.5",
        layout === "grid3" ? "grid grid-cols-3 gap-1" : "flex gap-0.5",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          title={item.title}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
          className={cx(
            "flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-1.5 font-medium transition-colors duration-120",
            "disabled:cursor-not-allowed disabled:opacity-40",
            size === "sm" ? "py-1 text-[11.5px]" : "py-1.5 text-[12px]",
            layout === "fill" && "flex-1",
            item.value === value ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface UnderlineTabItem<T extends string | number> {
  id: T;
  label: ReactNode;
  title?: string;
}

/** A tab strip with an underline that slides to the selected tab. Measuring is
 *  this component's job: labels are renamed and tabs appear while it is on
 *  screen, so it re-measures on layout changes rather than only on selection. */
export function UnderlineTabs<T extends string | number>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly UnderlineTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const signature = items.map((item) => String(item.id)).join("|");

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const tab = wrap.querySelector<HTMLButtonElement>(
        `[data-tab="${CSS.escape(String(value))}"]`,
      );
      if (!tab) return;
      const next = { left: tab.offsetLeft, width: tab.offsetWidth };
      setUnderline((current) =>
        current.left === next.left && current.width === next.width ? current : next,
      );
    };
    measure();
    // Tabs are renamed while the strip is on screen, so watch the labels
    // themselves rather than only re-measuring when the selection moves.
    const observer = new ResizeObserver(measure);
    for (const tab of wrap.querySelectorAll("button")) observer.observe(tab);
    return () => observer.disconnect();
  }, [value, signature]);

  return (
    <div ref={wrapRef} className={cx("relative flex items-center gap-1", className)}>
      {items.map((item) => (
        <button
          key={String(item.id)}
          type="button"
          data-tab={String(item.id)}
          title={item.title}
          onClick={() => onChange(item.id)}
          className={cx(
            "relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
            item.id === value ? "text-ink" : "text-faint hover:text-mute",
          )}
        >
          {item.label}
        </button>
      ))}
      <div
        className="absolute -bottom-px h-0.5 rounded-full bg-accent transition-all duration-180"
        style={{
          left: underline.left,
          width: underline.width,
          transitionTimingFunction: "cubic-bezier(0.25,0.8,0.35,1)",
        }}
      />
    </div>
  );
}

/** A failed device write, reported inline above the control that caused it. */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cx("flex items-center gap-2 text-[12px] text-danger", className)}>
      <WarningIcon size={13} />
      <span className="min-w-0 flex-1 truncate" title={message}>
        {message}
      </span>
    </div>
  );
}

export interface ApplyBarAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

/** Apply / discard for a staged draft. A `clear` action makes the bar stack:
 *  apply on its own row, the two dismissive actions beneath it. */
export function ApplyBar({
  apply,
  discard,
  clear,
  busy,
  compact,
  className,
}: {
  apply: ApplyBarAction;
  discard?: ApplyBarAction;
  /** A destructive third action, e.g. clearing what is already on the device. */
  clear?: ApplyBarAction;
  busy?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const pad = compact ? "py-1" : undefined;
  const applyButton = (
    <Button
      variant="primary"
      className={cx(!clear && "flex-1", pad)}
      disabled={apply.disabled}
      title={apply.title}
      onClick={apply.onClick}
    >
      {busy && <SpinnerIcon size={13} />}
      {apply.label}
    </Button>
  );
  const discardButton = discard && (
    <Button
      variant="ghost"
      className={cx(clear && "flex-1 whitespace-nowrap", pad)}
      disabled={discard.disabled}
      title={discard.title}
      onClick={discard.onClick}
    >
      {discard.label}
    </Button>
  );

  if (!clear) {
    return (
      <div className={cx("flex items-center gap-2", className)}>
        {applyButton}
        {discardButton}
      </div>
    );
  }
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {applyButton}
      <div className="flex items-center gap-2">
        {discardButton}
        <Button
          variant="danger"
          className="flex-1 whitespace-nowrap"
          disabled={clear.disabled}
          title={clear.title}
          onClick={clear.onClick}
        >
          {clear.label}
        </Button>
      </div>
    </div>
  );
}
