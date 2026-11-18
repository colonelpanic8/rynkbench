// The macro's steps on the left of its editor, as GLIDE lists them: a grip to
// drag a step (or Alt + ↑/↓ on it), its number, its kind in colour, what it
// sends, and × to remove it; then + Add, Undo for the last move or removal,
// and Clear. Under them, how much of the shared macro space it takes.

import { useEffect, useRef } from "react";
import type { MacroStep } from "../../../model/macros";
import { cx } from "../../kit";
import { CloseIcon, GripIcon, TrashIcon, UndoIcon } from "../../icons";
import { kindTone, useStepText } from "./MacroSteps";
import { useStepDrag } from "./useStepDrag";
import { MacroSpace } from "./MacroSpace";

export const stepId = (index: number) => `s${index}`;

function Line() {
  return (
    <div data-testid="macro-line" className="-my-1.5 flex h-0 items-center" aria-hidden>
      <span className="size-2 rounded-full bg-accent-fill" />
      <span className="h-[3px] flex-1 rounded bg-accent-fill" />
      <span className="size-2 rounded-full bg-accent-fill" />
    </div>
  );
}

export function MacroStepList({
  steps,
  selected,
  insertAt,
  space,
  onOpen,
  onMove,
  onRemove,
  onClear,
  onUndo,
}: {
  steps: readonly MacroStep[];
  selected: string;
  /** Where + Add puts new steps while it is open (null: the end). */
  insertAt: number | null;
  space: { used: number; bytes: number };
  onOpen: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  /** Takes back the last move or removal; absent when there is none. */
  onUndo?: () => void;
}) {
  const stepText = useStepText();
  const drag = useStepDrag(onMove);
  const focusGrip = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusGrip.current === null) return;
    list.current?.querySelector<HTMLElement>(`[data-grip="${focusGrip.current}"]`)?.focus();
    focusGrip.current = null;
  });
  const adding = selected === "add";
  const insert = adding ? Math.min(insertAt ?? steps.length, steps.length) : -1;

  const nudge = (event: React.KeyboardEvent, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const to = index + (event.key === "ArrowDown" ? 1 : -1);
    if (to < 0 || to >= steps.length) return;
    focusGrip.current = to;
    onMove(index, to);
  };

  return (
    <div ref={list} data-step-list className="flex flex-col gap-2">
      {steps.map((step, index) => {
        const { kind, body } = stepText(step);
        const isSelected = selected === stepId(index);
        const lifted = drag.from === index;
        return (
          <div key={index} className="flex flex-col gap-2">
            {(insert === index || (drag.line?.row === index && !drag.line.after)) && <Line />}
            <div
              data-step={index}
              data-testid={`macro-row-${index}`}
              role="button"
              tabIndex={-1}
              onClick={() => onOpen(stepId(index))}
              className={cx(
                "group flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-body max-sm:py-3",
                lifted ? "border-dashed border-line opacity-40" : isSelected ? "border-accent bg-accent-dim/30" : "border-line bg-raised hover:border-line-strong",
              )}
            >
              <button
                type="button"
                data-grip={index}
                aria-label={`Move step ${index + 1} (Alt + arrow keys)`}
                title="Drag to move (or Alt + ↑/↓)"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => drag.start(event, index)}
                onKeyDown={(event) => nudge(event, index)}
                className="cursor-grab touch-none text-faint hover:text-ink"
              >
                <GripIcon size={13} />
              </button>
              <span className="w-4 text-right font-mono text-caption text-faint">{index + 1}</span>
              <span className={cx("w-16 shrink-0 text-caption font-semibold uppercase tracking-widest", kindTone(step.kind))}>{kind}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{body}</span>
              <button
                type="button"
                aria-label={`Remove step ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(index);
                }}
                className="cursor-pointer p-0.5 text-faint hover:text-danger"
              >
                <CloseIcon size={12} />
              </button>
            </div>
            {drag.line?.row === index && drag.line.after && <Line />}
          </div>
        );
      })}
      {insert === steps.length && steps.length > 0 && <Line />}
      {steps.length === 0 && <p className="px-1 text-body text-faint">Add an action</p>}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="macro-add"
          onClick={() => onOpen("add")}
          className={cx(
            "flex-1 cursor-pointer rounded-lg border py-2 text-body font-semibold",
            adding ? "border-accent bg-accent-dim/30 text-accent" : "border-dashed border-line-strong text-mute hover:text-ink",
          )}
        >
          + Add
        </button>
        {onUndo && (
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={onUndo} className="cursor-pointer rounded-lg border border-line-strong px-3 text-mute hover:text-accent">
            <UndoIcon size={14} />
          </button>
        )}
        {steps.length > 0 && (
          <button type="button" aria-label="Clear steps" title="Clear steps" onClick={onClear} className="cursor-pointer rounded-lg border border-line-strong px-3 text-mute hover:text-danger">
            <TrashIcon size={14} />
          </button>
        )}
      </div>
      <MacroSpace used={space.used} bytes={space.bytes} compact />
    </div>
  );
}
