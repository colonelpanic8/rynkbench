// The panel below the keyboard, as in GLIDE: what is being edited and its
// slots on the left, the tabs that fill the active slot in the middle, the
// tab's content on the right. The key editor and the combo editor share it.
// With the Key editor preference on Side it is a column beside the keyboard,
// its parts stacked as on a narrow screen.

import type { CSSProperties, ReactNode } from "react";
import { cx } from "../kit";
import { KeyPreview } from "../canvas/KeyPreview";
import type { KeyGlyph } from "../labels";
import { PREFERENCES, usePreference } from "../preferences";
import { CloseIcon, KeymapIcon, LightingIcon, MenuIcon, SlidersIcon } from "../icons";
import type { EditorTab } from "./editorTabs";

const TABS: Record<EditorTab, { label: string; Icon: (props: { size?: number }) => ReactNode }> = {
  pick: { label: "Pick Key", Icon: KeymapIcon },
  layer: { label: "Switch Layer", Icon: MenuIcon },
  lighting: { label: "RGB Lighting", Icon: LightingIcon },
  all: { label: "Every action", Icon: SlidersIcon },
};

/** The editor's parts stacked, as on a narrow screen and beside the keyboard. */
const STACKED = {
  side: "flex w-full shrink-0 flex-col gap-4 border-b border-line p-6",
  tabs: "flex w-full shrink-0 flex-row gap-2 overflow-x-auto border-b border-line bg-raised px-2 py-4",
} as const;

/** Whether the editor sits beside the keyboard (wide screens only). */
export function useEditorBeside(): boolean {
  return usePreference(PREFERENCES.keyEditorSide) === "right";
}

/** The panel's frame at its resizable size: its height below the keyboard, its
 *  width beside it (a column on narrow screens either way). */
function Frame({ size, className, children }: { size: number; className: string; children: ReactNode }) {
  const beside = useEditorBeside();
  return (
    <section
      style={{ "--editor-size": `${size}px` } as CSSProperties}
      className={cx(
        "flex shrink-0 bg-panel max-lg:h-auto max-lg:border-t max-lg:border-line",
        beside ? "lg:w-(--editor-size) lg:flex-col lg:overflow-y-auto lg:border-l lg:border-line" : "lg:h-(--editor-size) lg:border-t lg:border-line",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Shown while nothing is selected. */
export function EditorPlaceholder({ size, children }: { size: number; children: ReactNode }) {
  return (
    <Frame size={size} className="min-h-[132px] items-center justify-center px-6 py-8 text-center">
      <p className="text-ui font-semibold text-mute">{children}</p>
    </Frame>
  );
}

export function EditorPanel({
  size,
  side,
  tabs,
  tab,
  onTab,
  children,
}: {
  /** Height below the keyboard, width beside it (px). */
  size: number;
  /** The left column: what is edited and its slots. */
  side: ReactNode;
  tabs: readonly EditorTab[];
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
  /** The content of the open tab. */
  children: ReactNode;
}) {
  const beside = useEditorBeside();
  return (
    <Frame size={size} className={cx("min-h-0 max-lg:flex-col", !beside && "overflow-hidden")}>
      <div className={cx(STACKED.side, !beside && "lg:w-[360px] lg:overflow-y-auto lg:border-r lg:border-b-0")}>
        {side}
      </div>
      <div
        role="tablist"
        aria-orientation="vertical"
        className={cx(STACKED.tabs, !beside && "lg:w-[84px] lg:flex-col lg:overflow-x-visible lg:border-r lg:border-b-0")}
      >
        {tabs.map((id) => {
          const { label, Icon } = TABS[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              className={cx(
                "flex min-h-[58px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-caption leading-tight font-semibold transition-colors",
                tab === id ? "bg-accent-fill text-on-accent shadow-lg" : "text-mute hover:bg-hover hover:text-ink",
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </div>
      <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-4 pb-4", beside ? "max-lg:max-h-[420px] max-lg:overflow-y-auto" : "overflow-y-auto max-lg:max-h-[420px]")}>
        {children}
      </div>
    </Frame>
  );
}

/** The heading of the left column: a cap with the glyph, a title, a line under it, and Done. */
export function EditorHeading({
  glyph,
  title,
  detail,
  onDone,
  doneLabel,
}: {
  /** The key's face, drawn as on the keyboard (canvas/KeyPreview.tsx). */
  glyph: KeyGlyph;
  title: string;
  detail: ReactNode;
  onDone: () => void;
  doneLabel: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-accent bg-cap">
        <KeyPreview glyph={glyph} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-ui leading-5 font-semibold text-ink">{title}</div>
        <div className="text-small leading-4 font-medium text-mute">{detail}</div>
      </div>
      <button
        type="button"
        onClick={onDone}
        aria-label={doneLabel}
        title={doneLabel}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink"
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}
