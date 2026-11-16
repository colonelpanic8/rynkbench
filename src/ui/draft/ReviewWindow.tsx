// Review & send: what the draft changes, grouped (keys and lighting per layer,
// encoders, slots, layers, settings, lock and battery lights), each group with its own Discard, then
// Send, which writes it all to the keyboard in one go and says how it went.

import { createPortal } from "react-dom";
import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import { Button } from "../kit";
import { CloseIcon, SpinnerIcon } from "../icons";
import type { DraftGroup } from "../../workbench/draft/changes";
import { useDraft } from "./useDraft";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function groupText(group: DraftGroup, name: (layer: number) => string): { title: string; count: string } {
  const on = group.layer === undefined ? "" : ` on ${name(group.layer)}`;
  switch (group.area) {
    case "keys":
      return { title: `Keys${on}`, count: plural(group.count, "key") };
    case "encoders":
      return { title: `Encoders${on}`, count: plural(group.count, "encoder") };
    case "combos":
      return { title: "Combos", count: plural(group.count, "combo") };
    case "morse":
      return { title: "Morse (tap patterns)", count: group.count === 1 ? "1 entry" : `${group.count} entries` };
    case "forks":
      return { title: "Forks", count: plural(group.count, "fork") };
    case "lighting":
      return { title: `Lighting${on}`, count: plural(group.count, "key") };
    case "lightRules":
      return { title: "Lock and battery lights", count: plural(group.count, "key") };
    case "macros":
      return { title: "Macros", count: "changed" };
    case "layers":
      return { title: "Layer names and order", count: plural(group.count, "change") };
    case "profiles":
      return { title: "Tap-hold profiles", count: plural(group.count, "change") };
    case "pointing":
      return { title: "Pointing", count: "changed" };
    case "settings":
      return { title: "Keyboard settings", count: plural(group.count, "setting") };
    case "lightingControls":
      return { title: "RGB Lighting settings", count: plural(group.count, "setting") };
  }
}

export function ReviewWindow({ onClose }: { onClose: () => void }) {
  const { bundle, state } = useWorkbench();
  const draft = useDraft();
  const name = (layer: number) => layerName(state.layerMetadata, layer);
  const keyboard = bundle.info.product_name || "the keyboard";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-well/70 p-4 backdrop-blur-[1px]" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label="Review and send"
        onPointerDown={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-[440px] max-w-full flex-col gap-4 rounded-2xl border border-line-strong bg-panel p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-bold text-ink">Send to {keyboard}</h2>
            <p className="text-small text-mute">
              {draft.size === 0
                ? "Nothing to send: the keyboard has every change."
                : `${plural(draft.size, "change")} not on the keyboard yet.`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink">
            <CloseIcon size={11} />
          </button>
        </div>

        {draft.groups.length > 0 && (
          <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
            {draft.groups.map((group) => {
              const text = groupText(group, name);
              return (
                <li key={`${group.area}:${group.layer ?? ""}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-semibold text-ink">{text.title}</span>
                    <span className="block text-small text-mute">{text.count}</span>
                  </span>
                  <button
                    type="button"
                    disabled={draft.sending}
                    onClick={() => draft.discardGroup(group)}
                    className="cursor-pointer text-small text-mute underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
                  >
                    Discard
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-small text-faint">
          Combos, macros and settings go to the keyboard as you change them; Draft holds keys, encoders and lighting.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
          <Button
            variant="primary"
            disabled={draft.size === 0 || draft.sending}
            reason={draft.sending ? "Sending" : "Nothing to send"}
            onClick={() => void draft.send().then((done) => done && onClose())}
          >
            {draft.sending ? (
              <>
                <SpinnerIcon size={13} /> Sending… {draft.size} left
              </>
            ) : (
              `Send ${plural(draft.size, "change")}`
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
