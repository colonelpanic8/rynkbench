// The one place that says where the work goes, in the top bar:
// - which keyboard is connected and how (a green dot), or that this is a file;
// - Draft or Live, switched from the chip's menu;
// - in Draft, how many changes are not on the keyboard yet, with Review & send
//   and Discard, or "Up to date"; while sending, how many are left;
// - a draft kept from an earlier visit, to restore or forget.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useWorkbench } from "../state";
import { KIND_LABEL } from "../session-labels";
import { cx } from "../kit";
import { ChevronDownIcon, SpinnerIcon, UndoIcon } from "../icons";
import { useEarlierDraft, useRestoreEarlier } from "./earlier";
import { ReviewWindow } from "./ReviewWindow";
import { useDraft } from "./useDraft";
import { useLink } from "./link";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const MODES = [
  { live: false, title: "Draft", text: "Changes stay here until you send them. Best for several changes at once." },
  { live: true, title: "Live", text: "Each change goes to the keyboard as you make it." },
];

function ModeMenu({ at, onClose }: { at: DOMRect; onClose: () => void }) {
  const { bundle, io } = useWorkbench();
  const draft = useDraft();
  return createPortal(
    <>
      <div className="fixed inset-0 z-50" onPointerDown={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Connection"
        style={{ top: at.bottom + 6, left: Math.max(8, at.left) }}
        className="fixed z-50 flex w-80 flex-col gap-3 rounded-xl border border-line-strong bg-panel p-4 shadow-2xl"
      >
        <div>
          <div className="text-ui font-semibold text-ink">Connected to {bundle.info.product_name || "the keyboard"}</div>
          <div className="text-small text-mute">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</div>
        </div>
        <div role="radiogroup" aria-label="When changes go to the keyboard" className="flex flex-col gap-2">
          {MODES.map((mode) => {
            const chosen = draft.live === mode.live;
            const blocked = mode.live && !chosen && draft.size > 0;
            return (
              <button
                key={mode.title}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={blocked}
                title={blocked ? `Send or discard the ${plural(draft.size, "change")} first` : undefined}
                onClick={() => void draft.setLive(mode.live).then(onClose)}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  chosen ? "border-accent bg-accent-dim" : "border-line-strong hover:border-mute",
                )}
              >
                <span className={cx("mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-full border", chosen ? "border-accent" : "border-mute")}>
                  {chosen && <span className="size-2 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block text-ui font-semibold text-ink">{mode.title}</span>
                  <span className="block text-small text-mute">{mode.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={io.disconnect}
          className="self-start cursor-pointer text-small text-mute underline-offset-2 hover:text-ink hover:underline"
        >
          Disconnect
        </button>
      </div>
    </>,
    document.body,
  );
}

export function ConnectionChip() {
  const { bundle } = useWorkbench();
  const draft = useDraft();
  const earlier = useEarlierDraft();
  const { restore, forget } = useRestoreEarlier();
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [review, setReview] = useState(false);
  const link = useLink();

  if (draft.offline) {
    return (
      <span
        title="Working on a file: changes are kept when you save it"
        className="flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-body font-semibold text-mute"
      >
        <span className="size-2 rounded-full bg-mute" aria-hidden /> File
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => setMenu(event.currentTarget.getBoundingClientRect())}
        title="Connection, and when changes go to the keyboard"
        className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line-strong pr-2 pl-3 text-body font-semibold text-ink transition-colors hover:border-mute"
      >
        <span
          className={cx("size-2 rounded-full", link.lost ? "bg-danger" : "bg-ok shadow-[0_0_6px_var(--color-ok)]")}
          aria-hidden
        />
        <span className="max-w-32 truncate max-lg:hidden">{bundle.info.product_name || "Keyboard"}</span>
        {link.lost && <span className="text-danger">not connected</span>}
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-small font-semibold",
            draft.live ? "bg-accent-fill text-on-accent" : "bg-hover text-ink",
          )}
        >
          {draft.live ? "Live" : "Draft"}
        </span>
        <ChevronDownIcon size={11} className="text-mute" />
      </button>

      {link.lost ? (
        <span className="flex h-8 items-center gap-1 rounded-full border border-line-strong pr-1 pl-3 text-body text-mute">
          {draft.size > 0 ? `${plural(draft.size, "change")} kept for when it is back` : "Your changes are kept"}
          {link.reconnect && (
            <button type="button" onClick={link.reconnect} className="cursor-pointer rounded-full bg-accent-fill px-2.5 py-0.5 font-semibold text-on-accent">
              Reconnect
            </button>
          )}
        </span>
      ) : earlier ? (
        <span className="flex h-8 items-center gap-1 rounded-full border border-warn/60 bg-warn/10 pr-1 pl-3 text-body text-ink">
          {plural(earlier.size, "change")} from before, not on the keyboard
          <button type="button" onClick={() => restore(earlier)} className="cursor-pointer rounded-full bg-accent-fill px-2.5 py-0.5 font-semibold text-on-accent">
            Restore
          </button>
          <button type="button" onClick={forget} className="cursor-pointer rounded-full px-2 py-0.5 text-mute hover:text-ink">
            Forget
          </button>
        </span>
      ) : draft.sending ? (
        <span role="status" className="flex items-center gap-1.5 text-body text-accent">
          <SpinnerIcon size={13} /> Sending… {draft.size} left
        </span>
      ) : draft.live ? null : draft.size === 0 ? (
        <span className="text-body text-mute max-md:hidden">Up to date</span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void draft.discard()}
            aria-label="Discard the changes not on the keyboard"
            title="Discard the changes not on the keyboard"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-line-strong text-mute hover:text-ink"
          >
            <UndoIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => setReview(true)}
            title="See what changes, then send it to the keyboard"
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-accent-fill px-3 text-body font-semibold text-on-accent hover:brightness-110"
          >
            Review & send
            <span className="rounded-full bg-on-accent/20 px-1.5 text-small tnum">{draft.size}</span>
          </button>
        </>
      )}

      {menu && <ModeMenu at={menu} onClose={() => setMenu(null)} />}
      {review && <ReviewWindow onClose={() => setReview(false)} />}
    </div>
  );
}
