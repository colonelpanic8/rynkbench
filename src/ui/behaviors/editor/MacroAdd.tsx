// The right pane while + Add is selected, as in GLIDE: one place to add a step
// that sends a key, layer or macro (each pick is the next step), typed text,
// or a pause or the "on release" line. New steps go where the line in the
// list shows: under the step that was selected, else at the end.

import { useState } from "react";
import type { MacroStep, SendKind } from "../../../model/macros";
import { NEW_DELAY_MS, sendStep } from "../../../model/macro-draft";
import { isEncodableText } from "../../../model/macros";
import type { Pick } from "../../keymap/pickKey";
import { Button, cx } from "../../kit";
import { Heading, SendKindChoice, StepPicker, panelClass } from "./MacroSteps";

type Tab = "step" | "text" | "control";
const TABS: ReadonlyArray<[Tab, string]> = [
  ["step", "Step"],
  ["text", "Type text"],
  ["control", "Pause & release"],
];

const chip = (on: boolean) =>
  cx(
    "cursor-pointer rounded-lg border px-3 py-1.5 text-small font-semibold",
    on ? "border-accent bg-accent-dim/30 text-accent" : "border-line-strong text-mute hover:text-ink",
  );

export function MacroAdd({
  startOn,
  allow,
  onAdd,
}: {
  /** The tab it opens on. */
  startOn: Tab;
  allow: (pick: Pick) => boolean;
  /** Adds steps; `open` selects the first one added. */
  onAdd: (steps: MacroStep[], open?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>(startOn);
  const [kind, setKind] = useState<SendKind>("tap");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const add = (steps: MacroStep[], said: string, open = false) => {
    onAdd(steps, open);
    setNote(said);
  };
  const plain = isEncodableText(text);

  return (
    <>
      <Heading>Add to this macro</Heading>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" data-testid={`macro-tab-${id}`} onClick={() => { setTab(id); setNote(""); }} className={chip(tab === id)}>
            {label}
          </button>
        ))}
      </div>
      {note && <p data-testid="macro-add-note" className="text-small font-semibold text-accent">{note}</p>}
      {tab === "step" && (
        <>
          <div className={panelClass}>
            <SendKindChoice value={kind} onChange={setKind} />
          </div>
          <p className="text-small text-faint">Pick a key, layer or macro: each pick is added as the next step.</p>
          <StepPicker allow={allow} onPick={(action) => add([sendStep(kind, action)], "Added.")} />
        </>
      )}
      {tab === "text" && (
        <div className="flex flex-col gap-2">
          <textarea
            data-testid="macro-text"
            value={text}
            rows={4}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type what the macro should type, for example: Kind regards,"
            className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-body text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <p className={cx("text-small", plain ? "text-faint" : "text-warn")}>
            {plain ? "Plain ASCII, as typed on a US keyboard." : "Only plain ASCII text fits in a macro."}
          </p>
          <Button
            variant="primary"
            className="self-start"
            disabled={!text || !plain}
            reason={!text ? "Type some text first" : "Only plain ASCII text fits in a macro"}
            onClick={() => {
              add([{ kind: "text", text }], `Added “${text}”.`);
              setText("");
            }}
          >
            Add text
          </Button>
        </div>
      )}
      {tab === "control" && (
        <div className="grid items-start gap-2 sm:grid-cols-2">
          <button type="button" data-testid="macro-add-delay" onClick={() => add([{ kind: "delay", ms: NEW_DELAY_MS }], "", true)} className="cursor-pointer rounded-lg border border-line-strong px-2.5 py-1.5 text-left hover:border-accent">
            <span className="block text-body font-semibold text-ink">Pause</span>
            <span className="block text-small text-faint">Wait a moment before the next step.</span>
          </button>
          <button
            type="button"
            data-testid="macro-add-letgo"
            onClick={() => add([{ kind: "letGo" }], "", true)}
            className="cursor-pointer rounded-lg border border-line-strong px-2.5 py-1.5 text-left hover:border-accent"
          >
            <span className="block text-body font-semibold text-ink">On key release</span>
            <span className="block text-small text-faint">Run the steps above when the key is pressed, the steps below when it is let go.</span>
          </button>
        </div>
      )}
    </>
  );
}
