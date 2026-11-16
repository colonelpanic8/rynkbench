// Settings, as in GLIDE (ui/settingsPanel.jsx there): a panel at the side of
// the screen, away from the Layers panel (a full sheet on phones), so the
// keyboard stays in view and every choice shows at once. Pictures and short
// labels; a word that needs explaining has an (i) that opens one line. Every
// choice is browser-local (preferences.ts) and never reaches the keyboard.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { LOCALES, getLocaleId, setLocaleId, subscribeLocale } from "./locale";
import { setTheme, useTheme } from "./theme";
import { themeList } from "./theme/themes";
import { setWording, useWording } from "./terms";
import { PREFERENCES, detectOs, resetPreferences, usePreference, type Os } from "./preferences";
import type { Setting as Stored } from "./settings";
import { cx } from "./kit";
import { CloseIcon, GearIcon, InfoIcon } from "./icons";

const OS_NAMES: Record<Os, string> = { mac: "Mac", win: "Windows", linux: "Linux" };

/** One choice of a few, each with an optional picture above its label. */
function Choices<T extends string | boolean>({
  value,
  onPick,
  options,
  label,
}: {
  value: T;
  onPick: (value: T) => void;
  options: readonly { value: T; label: string; picture?: ReactNode }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-xl border border-line bg-raised p-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onPick(option.value)}
          className={cx(
            "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-body font-semibold transition-colors",
            value === option.value ? "bg-line text-ink shadow-sm" : "text-mute hover:text-ink",
          )}
        >
          {option.picture}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A stored preference as a set of choices. */
function PreferenceChoices<T extends string | boolean>({
  setting,
  ...rest
}: { setting: Stored<T> } & Omit<Parameters<typeof Choices<T>>[0], "value" | "onPick">) {
  const value = usePreference(setting);
  return <Choices value={value} onPick={setting.set} {...rest} />;
}

/** A setting: its label, an (i) when a word needs explaining, and its control. */
function Setting({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-body font-semibold text-ink">
        {label}
        {info && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`About ${label}`}
            title={info}
            className="cursor-pointer text-mute hover:text-ink"
          >
            <InfoIcon size={13} />
          </button>
        )}
      </div>
      {open && <p className="-mt-0.5 text-small leading-snug text-mute">{info}</p>}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h4 className="text-caption font-semibold tracking-widest text-mute uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** A tiny screen showing where a panel sits, in the text colour. */
function Screen({ at }: { at: "bottom" | "right" | "left" }) {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="33" height="21" rx="3" fill="none" stroke="currentColor" opacity="0.5" />
      {at === "bottom" && <rect x="2" y="14" width="30" height="6" rx="1.5" fill="currentColor" />}
      {at === "right" && <rect x="23" y="2" width="9" height="18" rx="1.5" fill="currentColor" />}
      {at === "left" && <rect x="2" y="2" width="9" height="18" rx="1.5" fill="currentColor" />}
    </svg>
  );
}

/** A theme as a little picture of the editor in its colours. */
function Swatch({ colors: [bg, panel, key, accent] }: { colors: readonly [string, string, string, string] }) {
  return (
    <span className="flex h-10 w-full overflow-hidden rounded-md border border-line" style={{ background: bg }} aria-hidden>
      <span className="w-1/4" style={{ background: panel }} />
      <span className="flex flex-1 items-center justify-center gap-1">
        {[key, key, accent].map((color, i) => (
          <span key={i} className="size-3 rounded-sm" style={{ background: color }} />
        ))}
      </span>
    </span>
  );
}

function ThemeChoice() {
  const theme = useTheme();
  const themes = themeList();
  return (
    <div className="flex flex-col gap-2">
      {/* Dark themes on the first row, light ones on the second, each Default first. */}
      {(["dark", "light"] as const).map((scheme) => (
        <div key={scheme} className="grid grid-cols-3 gap-2">
          {themes
            .filter((t) => t.scheme === scheme)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
                className={cx(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-1.5 text-small font-semibold transition-colors",
                  theme === t.id ? "border-accent text-ink ring-2 ring-accent" : "border-line text-mute hover:text-ink",
                )}
              >
                <Swatch colors={t.swatch} />
                {t.name}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

export function SettingsBody() {
  const wording = useWording();
  const localeId = useSyncExternalStore(subscribeLocale, getLocaleId, getLocaleId);
  const symbol = (text: string) => <span className="text-title leading-none">{text}</span>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
      <Section title="Look">
        <Setting label="Theme">
          <ThemeChoice />
        </Setting>
        <Setting
          label="Highlight special keys"
          info="Layer, Bluetooth, lighting and other special keys get the theme's highlight colours."
        >
          <PreferenceChoices
            label="Highlight special keys"
            setting={PREFERENCES.highlightSpecialKeys}
            options={[
              { value: false, label: "Off" },
              { value: true, label: "On" },
            ]}
          />
        </Setting>
        <Setting
          label="Terminology"
          info="Friendly: plain words, like Tap patterns. Technical: RMK's and Rynk's own terms, like Morse."
        >
          <Choices
            label="Terminology"
            value={wording}
            onPick={setWording}
            options={[
              { value: "friendly", label: "Friendly" },
              { value: "technical", label: "Technical" },
            ]}
          />
        </Setting>
        <Setting
          label="Show shifted characters"
          info="The small extra character on a key: what Shift gives, like @ above the 2."
        >
          <PreferenceChoices
            label="Show shifted characters"
            setting={PREFERENCES.shiftedCharacters}
            options={[
              { value: "base", label: "Base layer" },
              { value: "all", label: "All layers" },
            ]}
          />
        </Setting>
      </Section>
      <Section title="Your computer">
        <PreferenceChoices
          label="Your computer"
          setting={PREFERENCES.os}
          options={[
            { value: "auto", label: "Auto", picture: <span className="text-caption font-semibold text-mute">{OS_NAMES[detectOs()]}</span> },
            { value: "mac", label: "Mac", picture: symbol("⌘") },
            { value: "win", label: "Windows", picture: symbol("⊞") },
            { value: "linux", label: "Linux", picture: symbol("❖") },
          ]}
        />
        <Setting label="Keyboard layout" info="The layout your computer types with: it decides the characters keys show and the picker offers.">
          <select
            value={localeId}
            onChange={(event) => setLocaleId(event.target.value)}
            aria-label="Keyboard layout"
            className="w-full cursor-pointer rounded-lg border border-line bg-raised px-2 py-1.5 text-body text-ink hover:border-line-strong"
          >
            {LOCALES.map((locale) => (
              <option key={locale.id} value={locale.id}>
                {locale.name}
              </option>
            ))}
          </select>
        </Setting>
      </Section>
      <Section title="Screen">
        <Setting label="Key editor">
          <PreferenceChoices
            label="Key editor"
            setting={PREFERENCES.keyEditorSide}
            options={[
              { value: "bottom", label: "Bottom", picture: <Screen at="bottom" /> },
              { value: "right", label: "Side", picture: <Screen at="right" /> },
            ]}
          />
        </Setting>
        <Setting label="Layers panel">
          <PreferenceChoices
            label="Layers panel"
            setting={PREFERENCES.sidePanelSide}
            options={[
              { value: "left", label: "Left", picture: <Screen at="left" /> },
              { value: "right", label: "Right", picture: <Screen at="right" /> },
            ]}
          />
        </Setting>
      </Section>
      <button
        type="button"
        onClick={resetPreferences}
        title="Puts these settings back to default. Your keyboard layout stays as it is."
        className="cursor-pointer self-start text-small font-semibold text-mute underline underline-offset-2 hover:text-ink"
      >
        Reset settings to default
      </button>
    </div>
  );
}

/** The top bar's Settings button and the panel it opens. */
export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRight = usePreference(PREFERENCES.sidePanelSide) === "right";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        className={cx(
          "flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150",
          open ? "bg-raised text-ink" : "text-mute hover:bg-hover hover:text-ink",
        )}
      >
        <GearIcon size={18} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <aside
              aria-label="Settings"
              className={cx(
                "fixed inset-0 z-50 flex flex-col bg-panel shadow-2xl animate-fade-up",
                "sm:inset-auto sm:top-3 sm:bottom-3 sm:w-[360px] sm:rounded-2xl sm:border sm:border-line",
                // Away from the Layers panel.
                panelRight ? "sm:left-3" : "sm:right-3",
              )}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-4">
                <span className="text-accent">
                  <GearIcon size={18} />
                </span>
                <h3 className="flex-1 text-title font-bold text-ink">Settings</h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close settings" className="cursor-pointer text-mute hover:text-ink">
                  <CloseIcon size={18} />
                </button>
              </div>
              <SettingsBody />
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
