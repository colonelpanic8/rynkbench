// Keymap mode: layer tabs over the canvas; binding editor in the inspector.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EncoderAction, KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph, keyActionDescription } from "../labels";
import { encoderPendingId, keyPendingId, useWorkbench } from "../state";
import { ActionEditor } from "./ActionEditor";
import { Button, SectionLabel, cx } from "../kit";
import { StarIcon, WarningIcon, CloseIcon } from "../icons";

function LayerTabs() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(`[data-layer="${state.uiLayer}"]`);
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [state.uiLayer, numLayers]);

  return (
    <div className="flex items-center gap-3 px-1">
      <div ref={wrapRef} className="relative flex items-center gap-1">
        {Array.from({ length: numLayers }, (_, n) => {
          const isDefault = n === state.defaultLayer;
          return (
            <button
              key={n}
              type="button"
              data-layer={n}
              onClick={() => dispatch({ type: "uiLayer", layer: n })}
              className={cx(
                "relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                n === state.uiLayer ? "text-ink" : "text-faint hover:text-mute",
              )}
              title={`Layer ${n}${isDefault ? " · default" : ""}`}
            >
              <span className="tnum">Layer {n}</span>
              {isDefault && (
                <span title="Default layer" className="inline-flex">
                  <StarIcon size={11} filled className="text-warn" />
                </span>
              )}
            </button>
          );
        })}
        <div
          className="absolute -bottom-px h-0.5 rounded-full bg-accent transition-all duration-180"
          style={{ left: underline.left, width: underline.width, transitionTimingFunction: "cubic-bezier(0.25,0.8,0.35,1)" }}
        />
      </div>
      {state.uiLayer !== state.currentLayer && (
        <span className="text-[11.5px] text-faint">
          Editing Layer {state.uiLayer} · Layer {state.currentLayer} is live
        </span>
      )}
      <div className="flex-1" />
      {state.uiLayer !== state.defaultLayer && (
        <Button
          variant="ghost"
          className="text-[12px]"
          title="Make this the layer the keyboard starts on"
          onClick={() => io.setDefaultLayer(state.uiLayer)}
        >
          <StarIcon size={12} />
          Make default
        </Button>
      )}
    </div>
  );
}

export function KeymapCenter() {
  const { bundle, state, dispatch } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const layer = state.layers[state.uiLayer];

  const decorFor = (key: KeyView): KeyDecor => {
    const action = layer?.[key.row * cols + key.col];
    const pending = state.pending[keyPendingId(state.uiLayer, key.row, key.col)];
    const glyph = action !== undefined ? keyActionGlyph(action) : { text: "" };
    // Enrichment label as fallback for unbound keys.
    if (!glyph.text && key.label) {
      glyph.text = key.label;
      glyph.dim = true;
    }
    const selected =
      state.selection?.type === "key" &&
      state.selection.row === key.row &&
      state.selection.col === key.col;
    return {
      glyph,
      selected,
      pending: pending?.status === "pending",
      error: pending?.status === "error",
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
      <LayerTabs />
      <BoardWell model={bundle.model}>
        <KeyboardCanvas
          model={bundle.model}
          className="h-full w-full"
          decorFor={decorFor}
          encoderDecorFor={(enc) => ({
            selected: state.selection?.type === "encoder" && state.selection.id === enc.id,
            pending:
              state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status === "pending",
            error: state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status === "error",
          })}
          onKeyPointerDown={(key) =>
            dispatch({ type: "select", selection: { type: "key", row: key.row, col: key.col } })
          }
          onEncoderPointerDown={(enc) =>
            dispatch({ type: "select", selection: { type: "encoder", id: enc.id } })
          }
          onBackgroundPointerDown={() => dispatch({ type: "select", selection: null })}
        />
      </BoardWell>
    </div>
  );
}

function KeyInspector({ row, col }: { row: number; col: number }) {
  const { bundle, state, dispatch, io } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const action = state.layers[state.uiLayer]?.[row * cols + col] ?? "No";
  const pending = state.pending[keyPendingId(state.uiLayer, row, col)];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Selected key</SectionLabel>
          <span className="font-mono text-[11px] text-faint">
            r{row} · c{col} · layer {state.uiLayer}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-raised px-3.5 py-3">
          <div className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-cap-edge bg-cap px-2 font-mono text-[15px] text-cap-ink">
            {keyActionGlyph(action).text || "·"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">
              {keyActionDescription(action)}
            </div>
            {pending?.status === "pending" && (
              <div className="text-[11.5px] text-accent">Writing to device…</div>
            )}
          </div>
        </div>
        {pending?.status === "error" && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-dim/25 px-3 py-2 text-[12px] text-danger">
            <WarningIcon size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div>Write failed: {pending.message}</div>
              <div className="mt-1 flex gap-3">
                {pending.attempted && (
                  <button
                    type="button"
                    className="cursor-pointer font-medium underline underline-offset-2"
                    onClick={() => io.setKey(state.uiLayer, row, col, pending.attempted!)}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className="cursor-pointer text-mute underline underline-offset-2"
                  onClick={() => dispatch({ type: "keyErrDismiss", layer: state.uiLayer, row, col })}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ActionEditor
        key={`${state.uiLayer}:${row}:${col}`}
        current={action}
        numLayers={bundle.caps.num_layers}
        onCommit={(next) => io.setKey(state.uiLayer, row, col, next)}
      />
    </div>
  );
}

function EncoderInspector({ id }: { id: number }) {
  const { bundle, state, io } = useWorkbench();
  const layer = state.uiLayer;
  const encoder = state.encoders[`${layer}:${id}`];
  const pending = state.pending[encoderPendingId(layer, id)];
  const [slot, setSlot] = useState<"cw" | "ccw">("cw");

  useEffect(() => {
    io.loadEncoder(layer, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, id]);

  const current: EncoderAction = encoder ?? { clockwise: "No", counter_clockwise: "No" };
  const slotAction = slot === "cw" ? current.clockwise : current.counter_clockwise;

  const commit = (action: KeyAction) => {
    const next: EncoderAction =
      slot === "cw"
        ? { ...current, clockwise: action }
        : { ...current, counter_clockwise: action };
    io.setEncoder(layer, id, next);
  };

  const slotChip = (which: "cw" | "ccw", label: string, title: string, value: KeyAction) => (
    <button
      type="button"
      onClick={() => setSlot(which)}
      title={title}
      className={cx(
        "flex flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-colors duration-120",
        slot === which
          ? "border-accent bg-accent-dim/30"
          : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</span>
      <span className="font-mono text-[13px] text-ink">
        {keyActionGlyph(value).text || "unset"}
      </span>
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Encoder {id}</SectionLabel>
          <span className="font-mono text-[11px] text-faint">layer {layer}</span>
        </div>
        {pending?.status === "pending" && (
          <div className="mt-1 text-[11.5px] text-accent">Writing to device…</div>
        )}
        {pending?.status === "error" && (
          <div className="mt-1 text-[11.5px] text-danger">Write failed: {pending.message}</div>
        )}
        <div className="mt-2 flex gap-2">
          {slotChip("cw", "CW ↻", "Clockwise", current.clockwise)}
          {slotChip("ccw", "CCW ↺", "Counter-clockwise", current.counter_clockwise)}
        </div>
      </div>
      <ActionEditor
        key={`${layer}:${id}:${slot}`}
        current={slotAction}
        numLayers={bundle.caps.num_layers}
        onCommit={commit}
      />
    </div>
  );
}

export function KeymapInspector() {
  const { state, dispatch } = useWorkbench();

  if (!state.selection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-raised text-faint">
          <span className="font-mono text-[16px]">⌨</span>
        </div>
        <div className="text-[13.5px] font-medium text-mute">Select a key to edit its binding</div>
        <div className="text-[12px] leading-relaxed text-faint">
          Click any key on the canvas. Switch layers with the tabs above the board.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 text-[11.5px] text-faint transition-colors duration-120 hover:text-mute"
          onClick={() => dispatch({ type: "select", selection: null })}
        >
          <CloseIcon size={11} />
          Clear selection
        </button>
      </div>
      {state.selection.type === "key" ? (
        <KeyInspector row={state.selection.row} col={state.selection.col} />
      ) : (
        <EncoderInspector id={state.selection.id} />
      )}
    </div>
  );
}
