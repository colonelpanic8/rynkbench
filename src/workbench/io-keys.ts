// The io's keys and encoders: one key written at once (Live) or staged (Draft),
// the keyboard's own key history, Send, encoders.

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { nextEditOrder } from "../model/history";
import { errorMessage } from "../session/errors";
import { sendStaged } from "./draft/send";
import { canTravelKeyEditHistory } from "./draft/selectors";
import type { IoContext, IoWriteResult, WorkbenchIo } from "./io";

type KeyIo = Pick<
  WorkbenchIo,
  "setKey" | "writeKeys" | "undoKeyEdit" | "redoKeyEdit" | "applyBatch" | "loadEncoder" | "setEncoder"
>;

export function keyIo(context: IoContext): KeyIo {
  const { session, getState, dispatch, cols, features } = context;
  let directKeyWritesPending = 0;
  let keyHistoryWritePending = false;

  const setKey = (
    layer: number,
    row: number,
    col: number,
    action: KeyAction,
    options?: { history?: "record" | "invalidate" },
  ): Promise<IoWriteResult> => {
    if (keyHistoryWritePending) {
      return Promise.resolve({ ok: false, message: "Undo or redo is in progress" });
    }
    const staging = getState();
    if (staging.batchMode) {
      if (staging.batchBusy) {
        return Promise.resolve({ ok: false, message: "Batch apply is in progress" });
      }
      dispatch({ type: "keyStage", layer, row, col, action });
      if (options?.history === "invalidate") dispatch({ type: "keyHistoryClear" });
      return Promise.resolve({ ok: true });
    }
    const prev = getState().layers[layer][row * cols + col];
    const sequence = nextEditOrder();
    directKeyWritesPending += 1;
    dispatch({ type: "keyWriteStart", layer, row, col, action });
    return session.keymap
      .setKey(layer, row, col, action)
      .then(
        () => {
          dispatch({ type: "keyWriteOk", layer, row, col });
          if (options?.history === "invalidate") {
            dispatch({ type: "keyHistoryClear" });
          } else {
            dispatch({
              type: "keyHistoryRecord",
              entry: { sequence, layer, row, col, before: prev, after: action },
            });
          }
          return { ok: true } as const;
        },
        (err) => {
          const message = errorMessage(err);
          dispatch({
            type: "keyWriteErr",
            layer,
            row,
            col,
            prev,
            attempted: action,
            message,
          });
          return { ok: false, message } as const;
        },
      )
      .finally(() => {
        directKeyWritesPending -= 1;
      });
  };

  const travelKeyHistory = async (
    direction: "undo" | "redo",
  ): Promise<IoWriteResult> => {
    const state = getState();
    if (
      keyHistoryWritePending ||
      directKeyWritesPending > 0 ||
      !canTravelKeyEditHistory(state, direction)
    ) {
      return { ok: false, message: "Key edit history is not available while a write is pending" };
    }
    const stack = direction === "undo" ? state.keyEditHistory.past : state.keyEditHistory.future;
    const entry = stack.at(-1);
    if (!entry) return { ok: false, message: `Nothing to ${direction}` };

    const action = direction === "undo" ? entry.before : entry.after;
    const previous = state.layers[entry.layer][entry.row * cols + entry.col];
    keyHistoryWritePending = true;
    dispatch({ type: "keyHistoryStart", direction, entry });
    dispatch({
      type: "keyWriteStart",
      layer: entry.layer,
      row: entry.row,
      col: entry.col,
      action,
    });
    try {
      await session.keymap.setKey(entry.layer, entry.row, entry.col, action);
      dispatch({
        type: "keyWriteOk",
        layer: entry.layer,
        row: entry.row,
        col: entry.col,
      });
      dispatch({ type: "keyHistoryFinish", direction, entry });
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      dispatch({
        type: "keyWriteErr",
        layer: entry.layer,
        row: entry.row,
        col: entry.col,
        prev: previous,
        attempted: action,
        message,
      });
      dispatch({ type: "keyHistoryFail", direction, message });
      return { ok: false, message };
    } finally {
      keyHistoryWritePending = false;
    }
  };

  return {
    setKey,
    async writeKeys(edits, options) {
      let first: IoWriteResult = { ok: true };
      for (const edit of edits) {
        const result = await setKey(edit.layer, edit.row, edit.col, edit.action, options);
        options?.onWritten?.(result.ok);
        if (first.ok && !result.ok) first = result;
      }
      return first;
    },
    undoKeyEdit() {
      return travelKeyHistory("undo");
    },
    redoKeyEdit() {
      return travelKeyHistory("redo");
    },
    applyBatch(options) {
      return sendStaged({ session, getState, dispatch, features }, options);
    },
    loadEncoder(layer, id) {
      session.keymap.getEncoder(id, layer).then(
        (action) => dispatch({ type: "encoderLoaded", layer, id, action }),
        () => {},
      );
    },
    setEncoder(layer, id, action) {
      const state = getState();
      if (state.batchMode) {
        if (!state.batchBusy) dispatch({ type: "encoderStage", layer, id, action });
        return;
      }
      const prev = state.encoders[`${layer}:${id}`];
      dispatch({ type: "encoderWriteStart", layer, id, action });
      session.keymap.setEncoder(id, layer, action).then(
        () => dispatch({ type: "encoderWriteOk", layer, id }),
        (err) =>
          dispatch({ type: "encoderWriteErr", layer, id, prev, message: errorMessage(err) }),
      );
    },
  };
}
