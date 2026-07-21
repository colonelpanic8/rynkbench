// Shared chrome primitives — one visual language for panels, chips, buttons.

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

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
