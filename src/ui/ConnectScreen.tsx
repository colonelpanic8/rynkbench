// First impression: the connect screen. One card per session provider.

import type { SessionProvider } from "../session/types";
import { Wordmark, UsbIcon, FlaskIcon, ChevronRightIcon, SpinnerIcon, WarningIcon } from "./icons";
import { cx } from "./kit";

export interface ConnectAttempt {
  providerIndex: number;
  status: "connecting" | "error";
  message?: string;
}

function ProviderGlyph({ kind }: { kind: SessionProvider["kind"] }) {
  const Icon = kind === "mock" ? FlaskIcon : UsbIcon;
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-mute transition-colors duration-150 group-hover:border-accent-deep group-hover:text-accent">
      <Icon size={20} />
    </div>
  );
}

function ProviderCard({
  provider,
  attempt,
  onConnect,
  disabled,
}: {
  provider: SessionProvider;
  attempt: ConnectAttempt | null;
  onConnect: () => void;
  disabled: boolean;
}) {
  const available = provider.available();
  const connecting = attempt?.status === "connecting";
  const error = attempt?.status === "error" ? (attempt.message ?? "Connection failed") : null;
  const clickable = available && !disabled;

  return (
    <div>
      <button
        type="button"
        disabled={!clickable}
        onClick={onConnect}
        className={cx(
          "group w-full rounded-2xl border bg-panel p-4 text-left transition-all duration-150",
          clickable
            ? "cursor-pointer border-line-soft hover:-translate-y-px hover:border-line-strong hover:bg-raised hover:shadow-[0_10px_30px_-12px_rgb(0_0_0/0.55)]"
            : "cursor-not-allowed border-line-soft opacity-100",
          error && "border-danger/40",
        )}
      >
        <div className={cx("flex items-center gap-4", !available && "opacity-45")}>
          <ProviderGlyph kind={provider.kind} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
              {provider.title}
              {provider.kind === "mock" && (
                <span className="rounded-full border border-line px-2 py-px text-[10px] font-medium uppercase tracking-wider text-faint">
                  simulated
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-mute">{provider.description}</div>
            {!available && (
              <div className="mt-1 text-[12px] text-faint">
                Not available in this browser or context
              </div>
            )}
          </div>
          <div className="shrink-0 text-faint transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent">
            {connecting ? <SpinnerIcon size={18} className="text-accent" /> : <ChevronRightIcon size={18} />}
          </div>
        </div>
      </button>
      {connecting && (
        <div className="mt-1.5 px-1 text-[12px] text-accent">Opening session…</div>
      )}
      {error && (
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px] text-danger">
          <WarningIcon size={14} />
          <span className="min-w-0 flex-1 truncate" title={error}>
            {error}
          </span>
          <button
            type="button"
            onClick={onConnect}
            className="cursor-pointer font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function ConnectScreen({
  providers,
  attempt,
  notice,
  onConnect,
}: {
  providers: SessionProvider[] | null;
  attempt: ConnectAttempt | null;
  /** Banner text, e.g. after an unexpected disconnect. */
  notice: string | null;
  onConnect: (index: number) => void;
}) {
  const connecting = attempt?.status === "connecting";
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-12">
      {/* backdrop: faint dot lattice + one restrained accent bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--color-line-soft) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 38%, black 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-180px] h-[380px] w-[640px] -translate-x-1/2 rounded-full opacity-[0.13]"
        style={{ background: "radial-gradient(ellipse, var(--color-accent), transparent 65%)" }}
      />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-line bg-panel shadow-[0_16px_40px_-18px_rgb(0_0_0/0.7)]">
            <Wordmark size={38} />
          </div>
          <h1 className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
            Rynkbench
          </h1>
          <p className="mt-2.5 text-[13.5px] text-mute">
            Configure keymaps and lighting over Rynk
          </p>
        </div>

        {notice && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-warn/30 bg-panel px-4 py-2.5 text-[12.5px] text-warn">
            <WarningIcon size={15} />
            {notice}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {providers === null && (
            <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-line-soft bg-panel py-8 text-[13px] text-mute">
              <SpinnerIcon size={16} className="text-accent" />
              Loading backends…
            </div>
          )}
          {providers?.map((provider, i) => (
            <ProviderCard
              key={`${provider.kind}:${provider.title}`}
              provider={provider}
              attempt={attempt?.providerIndex === i ? attempt : null}
              disabled={connecting}
              onConnect={() => onConnect(i)}
            />
          ))}
          {providers?.length === 0 && (
            <div className="rounded-2xl border border-line-soft bg-panel px-5 py-8 text-center text-[13px] text-mute">
              No backends are available in this build.
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-[11.5px] text-faint">
          Connections open locally — nothing leaves this machine.
        </p>
      </div>
    </div>
  );
}
