// Moving keys on the keymap canvas, as in GLIDE: drag a key onto another and
// the two swap; hold Ctrl, ⌘ or Alt while dropping and it is copied instead.
// From the keyboard: Space picks a key up, Space on another drops it there.
// A message names both keys. The writes are model/key-moves' plan.

import { useEffect, useRef, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { planKeyDrop, type KeyPlace } from "../../model/key-moves";
import { keyAddressLabel } from "../key-address";

import { showToast } from "../messages/store";
import { keyPendingId } from "../../workbench";
import { useWorkbench } from "../state";
import { useKeyText } from "../useKeyText";

export interface DragState {
  source: KeyView;
  destination: KeyView | null;
}

/** Where the dragged key is drawn under the pointer, and whether it will be copied. */
export interface Carry {
  x: number;
  y: number;
  copy: boolean;
}

const copyHeld = (event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
  event.ctrlKey || event.metaKey || event.altKey;

export function useKeyMoves() {
  const keyText = useKeyText();
  const { bundle, state, dispatch, io } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const layer = state.uiLayer;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<(DragState & { layer: number }) | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dragLayer = useRef<number | null>(null);

  // A move belongs to the layer it started on.
  useEffect(() => {
    if (dragLayer.current !== null && dragLayer.current !== layer) setMessage("Move cancelled: the layer changed");
    dragLayer.current = null;
    setDrag(null);
    setKeyboardMove(null);
  }, [layer]);

  // The carried key follows the pointer while a drag is on.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) {
      setCarry(null);
      return;
    }
    const follow = (event: PointerEvent) => setCarry({ x: event.clientX, y: event.clientY, copy: copyHeld(event) });
    const modifier = (event: KeyboardEvent) => setCarry((at) => at && { ...at, copy: copyHeld(event) });
    window.addEventListener("pointermove", follow);
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    return () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
    };
  }, [dragging]);

  const actionAt = (place: KeyPlace) => state.layers[layer]?.[place.row * cols + place.col] ?? "No";
  const legend = (place: KeyPlace) => keyText.glyph(actionAt(place)).text || "an empty key";
  const busy = (place: KeyPlace) => state.pending[keyPendingId(layer, place.row, place.col)]?.status === "pending";

  const drop = async (source: KeyView, destination: KeyView, fromLayer: number, copy: boolean) => {
    if (fromLayer !== layer) return setMessage("Move cancelled: the layer changed");
    if (busy(source) || busy(destination)) return setMessage("Wait for both keys to finish writing, then try again");
    const writes = planKeyDrop(actionAt, source, destination, copy);
    if (writes.length === 0) return;
    const text = copy
      ? `Copied ${legend(source)} to ${keyAddressLabel(destination)}`
      : `Swapped ${legend(source)} (${keyAddressLabel(source)}) and ${legend(destination)} (${keyAddressLabel(destination)})`;
    dispatch({ type: "select", selection: { type: "key", row: destination.row, col: destination.col } });
    const result = await io.writeKeys(writes.map(({ place, action }) => ({ layer, row: place.row, col: place.col, action })));
    if (!result.ok) return result.guarded ? undefined : showToast(`Not finished: ${result.message}`, { tone: "danger" });
    showToast(text, { tone: "ok" });
  };

  return {
    drag,
    carry,
    keyboardMove,
    message,
    setMessage,

    /** For the canvas: a drag started, moved over another key, or ended. */
    dragChange(source: KeyView | null, destination: KeyView | null) {
      if (source && dragLayer.current === null) dragLayer.current = layer;
      if (!source) dragLayer.current = null;
      setDrag(source ? { source, destination } : null);
    },
    /** For the canvas: the dragged key was let go over another. */
    dragDrop(source: KeyView, destination: KeyView) {
      void drop(source, destination, dragLayer.current ?? layer, carry?.copy ?? false);
    },

    /** Space picks a key up, Space on another drops it there (a swap); Escape cancels. */
    keyboardStep(key: KeyView, event: { key: string }) {
      if (event.key === "Escape") {
        if (keyboardMove) setMessage("Move cancelled");
        setKeyboardMove(null);
        return;
      }
      if (!keyboardMove) {
        if (busy(key)) return setMessage("Wait for that key to finish writing, then try again");
        setKeyboardMove({ layer, source: key, destination: null });
        setMessage(`Picked up ${legend(key)}: go to another key and press Space to swap, or Escape to cancel`);
        return;
      }
      setKeyboardMove(null);
      const { source, layer: fromLayer } = keyboardMove;
      if (source.row === key.row && source.col === key.col) return setMessage("Move cancelled");
      setMessage(null);
      void drop(source, key, fromLayer, false);
    },
    cancelKeyboardMove: () => setKeyboardMove(null),
    /** For the canvas: keyboard focus reached a key during a keyboard move. */
    keyboardFocus(key: KeyView) {
      if (!keyboardMove) return;
      const onSource = keyboardMove.source.row === key.row && keyboardMove.source.col === key.col;
      setKeyboardMove({ ...keyboardMove, destination: onSource ? null : key });
    },

    /** What the move under way will do, for the canvas pill. */
    status(): string | null {
      const target = drag?.destination ?? keyboardMove?.destination;
      const source = drag?.source ?? keyboardMove?.source;
      if (!source || !target) return null;
      if (carry?.copy) return `Release to copy ${legend(source)} onto ${legend(target)}`;
      return `${drag ? "Release" : "Press Space"} to swap ${legend(source)} and ${legend(target)}`;
    },
  };
}

export type KeyMoves = ReturnType<typeof useKeyMoves>;
