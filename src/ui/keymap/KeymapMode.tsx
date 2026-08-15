// Keymap mode: layer tabs over the canvas; binding editor in the inspector.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  EncoderAction,
  KeyAction,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph, keyActionDescription } from "../labels";
import { keyAddressLabel, matrixKeyLabel } from "../key-address";
import {
  encoderPendingId,
  keyPendingId,
  lightingBaseFor,
  lightingDraftFor,
  stagedBetween,
  useWorkbench,
} from "../state";
import { ActionEditor } from "./ActionEditor";
import { LayerLighting } from "./LayerLighting";
import { effectAnim, effectColor } from "../lighting/decor";
import {
  keyClipboardShortcut,
  parseKeyActionClipboard,
  serializeKeyAction,
} from "./keyManipulation";
import { Button, SectionLabel, TextInput, cx } from "../kit";
import { StarIcon, WarningIcon, CloseIcon, PlusIcon, TrashIcon } from "../icons";

function LayerTabs() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const occupiedLayers = state.layerMetadata
    ? state.layerMetadata.flatMap((metadata, layer) => (metadata.occupied ? [layer] : []))
    : Array.from({ length: numLayers }, (_, layer) => layer);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setRenaming(false);
    setName(state.layerMetadata?.[state.uiLayer]?.name ?? `Layer ${state.uiLayer}`);
  }, [state.uiLayer, state.layerMetadata]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(
      `[data-layer="${state.uiLayer}"]`,
    );
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [state.uiLayer, occupiedLayers.length]);

  const selectedName = state.layerMetadata?.[state.uiLayer]?.name ?? `Layer ${state.uiLayer}`;
  const structureSupported =
    state.layerMetadata !== null &&
    state.pointingConfig !== null &&
    state.behaviorOptions !== null &&
    (state.lightingState === null || state.lightingOutputMode !== null);

  return (
    <div className="flex items-center gap-3 px-1">
      <div ref={wrapRef} className="relative flex items-center gap-1">
        {occupiedLayers.map((n) => {
          const isDefault = n === state.defaultLayer;
          const label = state.layerMetadata?.[n]?.name ?? `Layer ${n}`;
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
              title={`${label} · physical layer ${n}${isDefault ? " · default" : ""}`}
            >
              <span>{label}</span>
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
          style={{
            left: underline.left,
            width: underline.width,
            transitionTimingFunction: "cubic-bezier(0.25,0.8,0.35,1)",
          }}
        />
      </div>
      {state.uiLayer !== state.currentLayer && (
        <span className="text-[11.5px] text-faint">
          Editing {selectedName} · {state.layerMetadata?.[state.currentLayer]?.name ?? `Layer ${state.currentLayer}`} is live
        </span>
      )}
      <div className="flex-1" />
      {state.layerMetadata !== null &&
        (renaming ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void io.renameLayer(state.uiLayer, name).then((result) => {
                if (result.ok) setRenaming(false);
              });
            }}
          >
            <TextInput
              autoFocus
              value={name}
              maxLength={32}
              className="w-40 py-1"
              aria-label="Layer name"
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" variant="primary" className="py-1" disabled={state.layerBusy}>
              Save
            </Button>
            <Button variant="ghost" className="py-1" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="ghost" className="text-[12px]" onClick={() => setRenaming(true)}>
            Rename
          </Button>
        ))}
      {structureSupported && !renaming && (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            className="px-2 text-[12px]"
            title="Move layer left"
            disabled={state.layerBusy || state.uiLayer === 0}
            onClick={() => void io.moveLayer(state.uiLayer, state.uiLayer - 1)}
          >
            ←
          </Button>
          <Button
            variant="ghost"
            className="px-2 text-[12px]"
            title="Move layer right"
            disabled={state.layerBusy || state.uiLayer === occupiedLayers.length - 1}
            onClick={() => void io.moveLayer(state.uiLayer, state.uiLayer + 1)}
          >
            →
          </Button>
          <Button
            variant="ghost"
            className="px-2 text-[12px]"
            title="Duplicate layer"
            disabled={state.layerBusy || occupiedLayers.length >= numLayers}
            onClick={() => void io.duplicateLayer(state.uiLayer)}
          >
            <PlusIcon size={12} /> Duplicate
          </Button>
          <Button
            variant="ghost"
            className="px-2 text-[12px] text-danger"
            title="Delete and compact this layer"
            disabled={state.layerBusy || occupiedLayers.length <= 1}
            onClick={() => {
              if (window.confirm(`Delete ${selectedName}? Layer references will be rewritten first.`)) {
                void io.deleteLayer(state.uiLayer);
              }
            }}
          >
            <TrashIcon size={12} />
          </Button>
        </div>
      )}
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
      {state.layerError && (
        <span className="max-w-64 text-[11px] text-danger" title={state.layerError}>
          {state.layerError}
        </span>
      )}
    </div>
  );
}

export function KeymapCenter() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const layer = state.layers[state.uiLayer];
  const scenesSupported = bundle.sceneStatus !== null;
  const [showLighting, setShowLighting] = useState(true);
  const [drag, setDrag] = useState<{
    source: KeyView;
    destination: KeyView | null;
  } | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<{
    layer: number;
    source: KeyView;
    destination: KeyView | null;
  } | null>(null);
  const [manipulationMessage, setManipulationMessage] = useState<string | null>(
    null,
  );
  const dragLayerRef = useRef<number | null>(null);
  const latestStateRef = useRef(state);
  const localClipboardRef = useRef<KeyAction | null>(null);
  latestStateRef.current = state;

  useEffect(() => {
    if (
      dragLayerRef.current !== null &&
      dragLayerRef.current !== state.uiLayer
    ) {
      setManipulationMessage(
        "Move cancelled because the selected layer changed.",
      );
    }
    dragLayerRef.current = null;
    setDrag(null);
    setKeyboardMove(null);
  }, [state.uiLayer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = keyClipboardShortcut(event);
      const selection = state.selection;
      if (
        !shortcut ||
        selection?.type !== "key" ||
        window.getSelection()?.isCollapsed === false
      )
        return;
      const selectedLayer = state.uiLayer;
      const { row, col } = selection;
      const action = state.layers[selectedLayer]?.[row * cols + col];
      if (action === undefined) return;
      event.preventDefault();

      if (shortcut === "copy") {
        localClipboardRef.current = structuredClone(action);
        if (!navigator.clipboard?.writeText) {
          setManipulationMessage(
            "Copied within Rynkbench; system clipboard access is unavailable.",
          );
          return;
        }
        void navigator.clipboard.writeText(serializeKeyAction(action)).then(
          () =>
            setManipulationMessage(
              `Copied ${keyActionDescription(action)} from Layer ${selectedLayer}, r${row} c${col}.`,
            ),
          () =>
            setManipulationMessage(
              "Copied within Rynkbench; the browser did not allow system clipboard access.",
            ),
        );
        return;
      }

      if (
        state.pending[keyPendingId(selectedLayer, row, col)]?.status ===
        "pending"
      ) {
        setManipulationMessage(
          "Wait for the selected key's current write to finish before pasting.",
        );
        return;
      }
      const paste = async (pasted: KeyAction | null) => {
        if (!pasted) {
          setManipulationMessage(
            "The clipboard does not contain a Rynkbench key binding.",
          );
          return;
        }
        const latestState = latestStateRef.current;
        const latestAction =
          latestState.layers[selectedLayer]?.[row * cols + col];
        if (
          latestState.pending[keyPendingId(selectedLayer, row, col)]?.status ===
            "pending" ||
          JSON.stringify(latestAction) !== JSON.stringify(action)
        ) {
          setManipulationMessage(
            "Paste cancelled because the selected key changed.",
          );
          return;
        }
        const result = await io.setKey(selectedLayer, row, col, pasted);
        setManipulationMessage(
          result.ok
            ? `Pasted ${keyActionDescription(pasted)} to Layer ${selectedLayer}, r${row} c${col}.`
            : `Paste failed: ${result.message}`,
        );
      };
      if (!navigator.clipboard?.readText) {
        void paste(
          localClipboardRef.current &&
            structuredClone(localClipboardRef.current),
        );
        return;
      }
      void navigator.clipboard.readText().then(
        (text) => paste(parseKeyActionClipboard(text)),
        () =>
          paste(
            localClipboardRef.current &&
              structuredClone(localClipboardRef.current),
          ),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cols, io, state.layers, state.pending, state.selection, state.uiLayer]);

  const dropKey = (
    source: KeyView,
    destination: KeyView,
    selectedLayer: number,
  ) => {
    if (selectedLayer !== state.uiLayer) {
      setManipulationMessage(
        "Move cancelled because the selected layer changed.",
      );
      return;
    }
    const sourceAction =
      state.layers[selectedLayer]?.[source.row * cols + source.col];
    if (sourceAction === undefined || sourceAction === "No") {
      setManipulationMessage("That key has no binding to move.");
      return;
    }
    if (
      state.pending[keyPendingId(selectedLayer, source.row, source.col)]
        ?.status === "pending" ||
      state.pending[
        keyPendingId(selectedLayer, destination.row, destination.col)
      ]?.status === "pending"
    ) {
      setManipulationMessage(
        "Wait for both keys' current writes to finish before moving.",
      );
      return;
    }

    dispatch({
      type: "select",
      selection: { type: "key", row: destination.row, col: destination.col },
    });
    void io.moveKey(selectedLayer, source, destination).then((result) => {
      setManipulationMessage(
        result.ok
          ? `Moved ${keyActionDescription(sourceAction)} to Layer ${selectedLayer}, r${destination.row} c${destination.col}.`
          : `Move incomplete: ${result.message}`,
      );
    });
  };

  const keyboardActivateKey = (key: KeyView, event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      if (keyboardMove) {
        setKeyboardMove(null);
        setManipulationMessage("Keyboard move cancelled.");
      }
      return;
    }
    if (event.key === "Enter") {
      dispatch({
        type: "select",
        selection: { type: "key", row: key.row, col: key.col },
      });
      return;
    }

    if (!keyboardMove) {
      const action = layer?.[key.row * cols + key.col];
      const pending =
        state.pending[keyPendingId(state.uiLayer, key.row, key.col)];
      if (action === undefined || action === "No") {
        setManipulationMessage("That key has no binding to move.");
        return;
      }
      if (pending?.status === "pending") {
        setManipulationMessage(
          "Wait for that key's current write to finish before moving.",
        );
        return;
      }
      dispatch({
        type: "select",
        selection: { type: "key", row: key.row, col: key.col },
      });
      setKeyboardMove({ layer: state.uiLayer, source: key, destination: null });
      setManipulationMessage(
        `Picked up ${keyActionDescription(action)}. Tab to a destination and press Space to move it, or Escape to cancel.`,
      );
      return;
    }

    if (
      keyboardMove.source.row === key.row &&
      keyboardMove.source.col === key.col
    ) {
      setKeyboardMove(null);
      setManipulationMessage("Keyboard move cancelled.");
      return;
    }
    const { layer: moveLayer, source } = keyboardMove;
    setKeyboardMove(null);
    dropKey(source, key, moveLayer);
  };

  // The layer's staged scene, previewed under the legends so bindings and
  // lighting can be judged together. Lighting mode remains the place to paint.
  const lit = scenesSupported && showLighting;
  const sceneDraft = lit ? lightingDraftFor(state, state.uiLayer) : null;
  const sceneStaged = useMemo(
    () =>
      lit ? stagedBetween(lightingDraftFor(state, state.uiLayer), lightingBaseFor(state, state.uiLayer)) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lit, state.layerDrafts, state.scenes, state.uiLayer],
  );

  const decorFor = (key: KeyView): KeyDecor => {
    const action = layer?.[key.row * cols + key.col];
    const pending =
      state.pending[keyPendingId(state.uiLayer, key.row, key.col)];
    const sceneCell =
      sceneDraft && key.ledId !== undefined ? sceneDraft[key.ledId] : undefined;
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
    const moveDestination = drag?.destination ?? keyboardMove?.destination;
    const dropTarget =
      moveDestination?.row === key.row && moveDestination.col === key.col;
    const keyboardMoveHint = keyboardMove
      ? keyboardMove.source.row === key.row &&
        keyboardMove.source.col === key.col
        ? " Move source; press Space to cancel."
        : " Press Space to move here and replace this binding."
      : action === undefined || action === "No"
        ? " No binding to move."
        : " Press Space to pick up this binding for a keyboard move.";
    return {
      glyph,
      ariaLabel: `Layer ${state.uiLayer}, row ${key.row}, column ${key.col}: ${
        action === undefined ? "unavailable" : keyActionDescription(action)
      }.${keyboardMoveHint}`,
      ariaKeyShortcuts: selected
        ? "Enter Space Escape Control+C Meta+C Control+V Meta+V"
        : "Enter Space Escape",
      selected,
      highlight: dropTarget,
      pending: pending?.status === "pending",
      error: pending?.status === "error",
      fill: sceneCell ? effectColor(sceneCell.effect) : undefined,
      fillAnim: sceneCell ? effectAnim(sceneCell.effect) : undefined,
      staged: key.ledId !== undefined && (sceneStaged?.has(key.ledId) ?? false),
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
      <LayerTabs />
      <div className="flex min-h-5 items-center justify-between gap-4 px-1 text-[11.5px] text-faint">
        <span className="flex items-center gap-3">
          {scenesSupported && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showLighting}
                onChange={(event) => setShowLighting(event.target.checked)}
                className="accent-(--color-accent)"
              />
              Show layer lighting
            </label>
          )}
          <span>
            Drag a bound key to move it; dropping replaces the destination.
            Ctrl/Cmd+C and Ctrl/Cmd+V copy or paste the selected binding. With a
            keyboard, press Space to pick up or drop.
          </span>
        </span>
        <span
          className="max-w-[46%] truncate text-right text-mute"
          aria-live="polite"
        >
          {drag?.destination
            ? `Release to move ${keyActionDescription(
                layer?.[drag.source.row * cols + drag.source.col] ?? "No",
              )} to r${drag.destination.row} c${drag.destination.col} and replace ${keyActionDescription(
                layer?.[drag.destination.row * cols + drag.destination.col] ??
                  "No",
              )}.`
            : keyboardMove?.destination
              ? `Press Space to move to r${keyboardMove.destination.row} c${keyboardMove.destination.col} and replace ${keyActionDescription(
                  layer?.[
                    keyboardMove.destination.row * cols +
                      keyboardMove.destination.col
                  ] ?? "No",
                )}.`
              : manipulationMessage}
        </span>
      </div>
      <BoardWell model={bundle.model}>
        <KeyboardCanvas
          model={bundle.model}
          className="h-full w-full"
          decorFor={decorFor}
          encoderDecorFor={(enc) => ({
            selected:
              state.selection?.type === "encoder" &&
              state.selection.id === enc.id,
            pending:
              state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status ===
              "pending",
            error:
              state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status ===
              "error",
          })}
          onKeyPointerDown={(key, event) => {
            const action = layer?.[key.row * cols + key.col];
            if (
              event.button === 0 &&
              action !== undefined &&
              action !== "No" &&
              state.pending[keyPendingId(state.uiLayer, key.row, key.col)]
                ?.status !== "pending"
            ) {
              dragLayerRef.current = state.uiLayer;
            }
            setKeyboardMove(null);
            dispatch({
              type: "select",
              selection: { type: "key", row: key.row, col: key.col },
            });
          }}
          onKeyKeyboardActivate={keyboardActivateKey}
          onKeyFocus={(key) => {
            if (!keyboardMove) return;
            const destination =
              keyboardMove.source.row === key.row &&
              keyboardMove.source.col === key.col
                ? null
                : key;
            setKeyboardMove({ ...keyboardMove, destination });
          }}
          onKeyDragChange={(source, destination) => {
            setDrag(source ? { source, destination } : null);
            if (!source) dragLayerRef.current = null;
          }}
          keyDraggable={(key) => {
            const action = layer?.[key.row * cols + key.col];
            return (
              action !== undefined &&
              action !== "No" &&
              state.pending[keyPendingId(state.uiLayer, key.row, key.col)]
                ?.status !== "pending"
            );
          }}
          onKeyDrop={(source, destination) => {
            const dragLayer = dragLayerRef.current;
            if (dragLayer === null) {
              setManipulationMessage(
                "Move cancelled because its source layer is unavailable.",
              );
              return;
            }
            dropKey(source, destination, dragLayer);
          }}
          onEncoderPointerDown={(enc) =>
            dispatch({
              type: "select",
              selection: { type: "encoder", id: enc.id },
            })
          }
          onBackgroundPointerDown={() => {
            setKeyboardMove(null);
            dispatch({ type: "select", selection: null });
          }}
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
  const key = bundle.model.keys.find((candidate) => candidate.row === row && candidate.col === col);
  const addressable = key ?? { row, col };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Selected key</SectionLabel>
          <span className="flex flex-col items-end font-mono">
            <span className="text-[12px] text-ink">{keyAddressLabel(addressable)}</span>
            <span className="text-[10.5px] text-faint">
              matrix {matrixKeyLabel(addressable)} · layer {state.uiLayer}
            </span>
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
              <div className="text-[11.5px] text-accent">
                Writing to device…
              </div>
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
                    onClick={() =>
                      io.setKey(state.uiLayer, row, col, pending.attempted!)
                    }
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className="cursor-pointer text-mute underline underline-offset-2"
                  onClick={() =>
                    dispatch({
                      type: "keyErrDismiss",
                      layer: state.uiLayer,
                      row,
                      col,
                    })
                  }
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
      <LayerLighting ledId={key?.ledId} />
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

  const current: EncoderAction = encoder ?? {
    clockwise: "No",
    counter_clockwise: "No",
  };
  const slotAction =
    slot === "cw" ? current.clockwise : current.counter_clockwise;

  const commit = (action: KeyAction) => {
    const next: EncoderAction =
      slot === "cw"
        ? { ...current, clockwise: action }
        : { ...current, counter_clockwise: action };
    io.setEncoder(layer, id, next);
  };

  const slotChip = (
    which: "cw" | "ccw",
    label: string,
    title: string,
    value: KeyAction,
  ) => (
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </span>
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
          <span className="font-mono text-[11px] text-faint">
            layer {layer}
          </span>
        </div>
        {pending?.status === "pending" && (
          <div className="mt-1 text-[11.5px] text-accent">
            Writing to device…
          </div>
        )}
        {pending?.status === "error" && (
          <div className="mt-1 text-[11.5px] text-danger">
            Write failed: {pending.message}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          {slotChip("cw", "CW ↻", "Clockwise", current.clockwise)}
          {slotChip(
            "ccw",
            "CCW ↺",
            "Counter-clockwise",
            current.counter_clockwise,
          )}
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
        <div className="text-[13.5px] font-medium text-mute">
          Select a key to edit its binding
        </div>
        <div className="text-[12px] leading-relaxed text-faint">
          Click or focus a key and press Enter to select it. Switch layers with
          the tabs above the board.
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
