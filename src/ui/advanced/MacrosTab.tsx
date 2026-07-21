// Macros: the flat RMK byte region decoded into an ordered list of
// op sequences (text / tap / press / release / delay). All macros share one
// region, so saving writes the whole thing back.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { hidLabel } from "../labels";
import { KeycodeBrowser } from "../keymap/ActionEditor";
import { useWorkbench } from "../state";
import type { DecodedMacro, MacroStep } from "../macros";
import {
  clampDelay,
  decodeMacros,
  encodeMacros,
  isEncodableText,
  macroByteCost,
  macroPreview,
} from "../macros";
import { Button, InspectorShell, SectionLabel, TextInput, cx } from "../kit";
import { CloseIcon, PlusIcon, TrashIcon, WarningIcon } from "../icons";
import { CenterScroll, SlotCard } from "./bits";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function stepSummary(step: MacroStep): { tag: string; body: string } {
  switch (step.kind) {
    case "text":
      return { tag: "text", body: `“${step.text}”` };
    case "tap":
      return { tag: "tap", body: hidLabel(step.code) };
    case "press":
      return { tag: "press", body: hidLabel(step.code) };
    case "release":
      return { tag: "release", body: hidLabel(step.code) };
    case "delay":
      return { tag: "delay", body: `${step.ms} ms` };
  }
}

const STEP_TAG_TONE: Record<string, string> = {
  text: "text-ink",
  tap: "text-accent",
  press: "text-warn",
  release: "text-warn",
  delay: "text-mute",
};

type AddKind = "text" | "tap" | "press" | "release" | "delay";

function AddStep({ onAdd }: { onAdd: (step: MacroStep) => void }) {
  const [kind, setKind] = useState<AddKind>("text");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [delay, setDelay] = useState(100);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-well/60 p-2.5">
      <div className="flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
        {(["text", "tap", "press", "release", "delay"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cx(
              "flex-1 cursor-pointer rounded-md px-1 py-1 text-[11px] font-medium capitalize transition-colors duration-120",
              kind === k ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {kind === "text" && (
        <div className="flex flex-col gap-1.5">
          <TextInput
            placeholder="Type the text to send…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          {!isEncodableText(text) && (
            <div className="text-[11px] text-warn">
              Only plain ASCII (en-US) can be stored in a macro.
            </div>
          )}
          <Button
            variant="primary"
            disabled={text.length === 0 || !isEncodableText(text)}
            onClick={() => {
              onAdd({ kind: "text", text });
              setText("");
            }}
          >
            Add text
          </Button>
        </div>
      )}

      {(kind === "tap" || kind === "press" || kind === "release") && (
        <KeycodeBrowser
          compact
          query={query}
          onQuery={setQuery}
          onPick={(code) => onAdd({ kind, code })}
        />
      )}

      {kind === "delay" && (
        <div className="flex items-center gap-2">
          <TextInput
            type="number"
            min={1}
            max={65000}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="w-24 text-right"
          />
          <span className="text-[11.5px] text-faint">ms</span>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => onAdd({ kind: "delay", ms: clampDelay(delay) })}
          >
            Add delay
          </Button>
        </div>
      )}
    </div>
  );
}

export function MacrosTab({ nav }: { nav: ReactNode }) {
  const { bundle, state, io } = useWorkbench();
  const capacity = bundle.caps.macro_space_size;

  const savedMacros = useMemo(() => decodeMacros(state.macroBytes), [state.macroBytes]);
  const [drafts, setDrafts] = useState<DecodedMacro[]>(savedMacros);
  const [sel, setSel] = useState<number | null>(null);

  // When the on-device region changes under a clean draft, follow it.
  const savedRef = useRef(savedMacros);
  useEffect(() => {
    if (same(drafts, savedRef.current)) setDrafts(savedMacros);
    savedRef.current = savedMacros;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMacros]);

  const dirty = !same(drafts, savedMacros);
  const macroPending = state.pending.macros;
  const pending = macroPending?.status === "pending";

  const usedBytes = drafts.reduce((n, m) => n + macroByteCost(m), 0);
  const overCapacity = usedBytes > capacity;

  const updateMacro = (index: number, next: DecodedMacro) => {
    setDrafts(drafts.map((m, i) => (i === index ? next : m)));
  };

  const removeMacro = (index: number) => {
    setDrafts(drafts.filter((_, i) => i !== index));
    setSel(null);
  };

  const selected = sel !== null ? drafts[sel] : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {nav}
        <CenterScroll>
          <div className="flex items-center gap-3 px-1">
            <span className="min-w-0 flex-1 text-[12.5px] text-faint">
              Macros share one byte region on the keyboard; keys reference them by position
              (M0, M1, …). Deleting a macro shifts the ones after it.
            </span>
          </div>

          {/* capacity bar */}
          <div className="rounded-xl border border-line-soft bg-panel px-4 py-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Macro space</SectionLabel>
              <span
                className={cx("tnum text-[12px]", overCapacity ? "text-danger" : "text-mute")}
              >
                {usedBytes} / {capacity} bytes
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well">
              <div
                className={cx(
                  "h-full rounded-full transition-all duration-300",
                  overCapacity ? "bg-danger" : "bg-accent-deep",
                )}
                style={{ width: `${Math.min(100, (usedBytes / Math.max(1, capacity)) * 100)}%` }}
              />
            </div>
          </div>

          {drafts.length === 0 && (
            <div className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-[12.5px] text-faint">
              No macros yet.
            </div>
          )}
          {drafts.map((macro, index) => (
            <SlotCard key={index} selected={index === sel} onClick={() => setSel(index)}>
              <div className="flex items-center gap-2.5">
                <span className="rounded-md border border-cap-edge bg-cap px-1.5 py-0.5 font-mono text-[11.5px] text-cap-ink">
                  M{index}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {macroPreview(macro)}
                </span>
                <span className="tnum shrink-0 text-[11px] text-faint">
                  {macro.steps.length} step{macro.steps.length === 1 ? "" : "s"} ·{" "}
                  {macroByteCost(macro)} B
                </span>
              </div>
            </SlotCard>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              setDrafts([...drafts, { steps: [] }]);
              setSel(drafts.length);
            }}
          >
            <PlusIcon size={12} />
            Add macro
          </Button>

          {/* save bar */}
          <div className="flex items-center gap-2 rounded-xl border border-line-soft bg-panel px-4 py-3">
            <Button
              variant="primary"
              disabled={!dirty || pending || overCapacity}
              onClick={() => io.writeMacros(encodeMacros(drafts))}
            >
              {pending ? "Writing…" : "Write macros to keyboard"}
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty || pending}
              onClick={() => {
                setDrafts(savedMacros);
                setSel(null);
              }}
            >
              Discard changes
            </Button>
            {overCapacity && (
              <span className="text-[12px] text-danger">Over capacity — trim some steps.</span>
            )}
            {macroPending?.status === "error" && (
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-danger">
                <WarningIcon size={13} className="shrink-0" />
                <span className="truncate">{macroPending.message}</span>
              </span>
            )}
          </div>
        </CenterScroll>
      </div>

      <InspectorShell>
        {selected === null || sel === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-raised font-mono text-[13px] text-faint">
              M0
            </div>
            <div className="text-[13.5px] font-medium text-mute">
              Select a macro to edit its steps
            </div>
            <div className="text-[12px] leading-relaxed text-faint">
              A macro plays a sequence of text, key taps, press/release pairs, and delays.
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Macro {sel}</SectionLabel>
              <span className="tnum text-[11px] text-faint">{macroByteCost(selected)} B</span>
            </div>

            <div className="flex flex-col gap-1">
              {selected.steps.map((step, i) => {
                const s = stepSummary(step);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5"
                  >
                    <span
                      className={cx(
                        "w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider",
                        STEP_TAG_TONE[s.tag],
                      )}
                    >
                      {s.tag}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">
                      {s.body}
                    </span>
                    <button
                      type="button"
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => {
                        const steps = selected.steps.slice();
                        [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                        updateMacro(sel, { steps });
                      }}
                      className="cursor-pointer text-faint transition-colors duration-120 hover:text-mute disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={i === selected.steps.length - 1}
                      onClick={() => {
                        const steps = selected.steps.slice();
                        [steps[i], steps[i + 1]] = [steps[i + 1], steps[i]];
                        updateMacro(sel, { steps });
                      }}
                      className="cursor-pointer text-faint transition-colors duration-120 hover:text-mute disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      title="Remove step"
                      onClick={() =>
                        updateMacro(sel, { steps: selected.steps.filter((_, j) => j !== i) })
                      }
                      className="cursor-pointer text-faint transition-colors duration-120 hover:text-danger"
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                );
              })}
              {selected.steps.length === 0 && (
                <div className="rounded-lg border border-line-soft bg-well/50 px-3 py-3 text-center text-[12px] text-faint">
                  No steps yet — add one below.
                </div>
              )}
            </div>

            <AddStep onAdd={(step) => updateMacro(sel, { steps: [...selected.steps, step] })} />

            <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
              <Button variant="danger" onClick={() => removeMacro(sel)}>
                <TrashIcon size={13} />
                Delete macro {sel}
              </Button>
              <div className="text-[11px] leading-relaxed text-faint">
                Deleting renumbers later macros — keys bound to M{sel + 1}+ will shift by one.
                Changes apply when you write the region.
              </div>
            </div>
          </div>
        )}
      </InspectorShell>
    </>
  );
}
