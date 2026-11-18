// The one window every behavior editor uses (ADR 0020), GLIDE's: the
// behavior's name at the top; its parts as cards on the left (the behavior
// first, then its patterns, steps or outputs); the selected card's editor on
// the right; Cancel and Apply at the foot. Nothing is written while you edit:
// Apply is one operation. Leaving with changes asks first. On a phone the
// cards come first and a card opens full screen with Back. The host
// (BehaviorEditorHost) draws it on the page's body.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, TextInput, cx } from "../../kit";
import { ChevronRightIcon, CloseIcon, PlusIcon, TrashIcon } from "../../icons";
import { askConfirm } from "../../messages/store";

export interface EditorCard {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  /** A card that can go has a trash button. */
  onRemove?: () => void;
}

export interface EditorShellProps {
  /** What it is, in the app's voice: "Tap pattern 3", "New tap pattern". */
  subtitle: string;
  name: string;
  onName: (name: string) => void;
  /** Shown in the empty name box. */
  namePlaceholder: string;
  cards: readonly EditorCard[];
  selected: string;
  onSelect: (id: string) => void;
  add?: { label: string; onClick: () => void; disabled?: boolean; reason?: string };
  /** Rows of its own under the cards (a macro's steps); `open` selects one and,
   *  on a phone, opens its editor. */
  list?: (open: (id: string) => void) => ReactNode;
  /** Something changed since the window opened. */
  dirty: boolean;
  /** Why Apply cannot go ahead, or null. */
  problem: string | null;
  /** Applies; true when done, so the window closes. */
  onApply: () => Promise<boolean>;
  onClose: () => void;
  children: ReactNode;
}

/** Asks before leaving with changes; true when the window may close. */
async function mayLeave(dirty: boolean): Promise<boolean> {
  if (!dirty) return true;
  return askConfirm({ title: "Discard your changes?", body: "Nothing you changed here has been applied.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true });
}

function Card({ card, selected, onSelect }: { card: EditorCard; selected: boolean; onSelect: () => void }) {
  return (
    <div className={cx("group flex items-center gap-2 rounded-lg border px-3 py-2", selected ? "border-accent-deep bg-accent-dim/20" : "border-line bg-raised hover:border-line-strong")}>
      <button type="button" aria-current={selected || undefined} onClick={onSelect} className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left">
        <span className="w-full truncate text-body font-semibold text-ink">{card.title}</span>
        {card.sub && <span className="w-full truncate text-small text-faint">{card.sub}</span>}
      </button>
      {card.onRemove && (
        <button type="button" aria-label="Remove" onClick={card.onRemove} className="cursor-pointer p-1 text-faint hover:text-danger sm:opacity-0 sm:group-hover:opacity-100">
          <TrashIcon size={13} />
        </button>
      )}
      <span className="text-faint sm:hidden">
        <ChevronRightIcon size={12} />
      </span>
    </div>
  );
}

export function EditorShell(props: EditorShellProps) {
  const { subtitle, name, onName, namePlaceholder, cards, selected, onSelect, add, list, dirty, problem, onApply, onClose, children } = props;
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (await mayLeave(dirty)) onClose();
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) void leaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const apply = async () => {
    setBusy(true);
    const done = await onApply();
    setBusy(false);
    if (done) onClose();
  };
  const pick = (id: string) => {
    onSelect(id);
    setPhoneOpen(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-well/80 backdrop-blur-md sm:p-4">
      <div role="dialog" aria-label={subtitle} className="flex h-dvh w-full flex-col overflow-hidden border-line bg-panel shadow-2xl sm:h-[86dvh] sm:w-[min(96vw,960px)] sm:rounded-2xl sm:border">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <TextInput value={name} onChange={(event) => onName(event.target.value)} placeholder={namePlaceholder} aria-label="Name" className="max-w-sm text-title font-semibold" />
            <span className="truncate px-1 text-small text-faint">{subtitle}</span>
          </div>
          <button type="button" aria-label="Close" onClick={() => void leave()} className="shrink-0 cursor-pointer px-2 text-mute hover:text-ink">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={cx("flex min-h-0 flex-col gap-2 overflow-y-auto border-line p-3 max-sm:w-full sm:w-72 sm:shrink-0 sm:border-r", phoneOpen && "max-sm:hidden")}>
            {cards.map((card) => (
              <Card key={card.id} card={card} selected={card.id === selected} onSelect={() => pick(card.id)} />
            ))}
            {list?.(pick)}
            {add && (
              <Button onClick={add.onClick} disabled={add.disabled} reason={add.reason} className="border-dashed border-line-strong text-mute hover:text-ink">
                <PlusIcon size={12} /> {add.label}
              </Button>
            )}
          </div>
          <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5", !phoneOpen && "max-sm:hidden")}>
            <button type="button" onClick={() => setPhoneOpen(false)} className="cursor-pointer self-start text-small text-accent sm:hidden">
              ‹ Back
            </button>
            {children}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 sm:px-6">
          <span className="min-w-0 flex-1 truncate text-small text-warn">{dirty ? problem : null}</span>
          <Button variant="ghost" onClick={() => void leave()}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!dirty || problem !== null || busy} reason={problem ?? "Nothing changed"} onClick={() => void apply()}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
