// The io's keys and encoders: one key written at once (Live) or drafted
// (Draft), Send, Undo and Redo, encoders.

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { errorMessage } from "../session/errors";
import { sendStaged } from "./draft/send";
import { canTravel } from "./draft/selectors";
import { applyOperation } from "./apply";
import type { IoContext, IoWriteResult, WorkbenchIo } from "./io";

type KeyIo = Pick<WorkbenchIo, "setKey" | "writeKeys" | "travel" | "applyBatch" | "loadEncoder" | "setEncoder">;

export function keyIo(context: IoContext): KeyIo {
  const { session, getState, dispatch, cols, features } = context;
  // A send waits for an RGB Apply still being written, so the two never write the same item.
  const send = async (options?: Parameters<WorkbenchIo["applyBatch"]>[0]) => {
    await context.realtime.settled();
    return sendStaged({ session, getState, dispatch, features }, options);
  };

  const setKey = (layer: number, row: number, col: number, action: KeyAction): Promise<IoWriteResult> => {
    const staging = getState();
    if (staging.batchMode) {
      if (staging.batchBusy) {
        return Promise.resolve({ ok: false, message: "Batch apply is in progress" });
      }
      dispatch({ type: "keyStage", layer, row, col, action });
      return Promise.resolve({ ok: true });
    }
    const prev = getState().layers[layer][row * cols + col];
    dispatch({ type: "keyWriteStart", layer, row, col, action });
    return session.keymap.setKey(layer, row, col, action).then(
      () => {
        dispatch({ type: "keyWriteOk", layer, row, col });
        return { ok: true } as const;
      },
      (err) => {
        const message = errorMessage(err);
        dispatch({ type: "keyWriteErr", layer, row, col, prev, attempted: action, message });
        return { ok: false, message } as const;
      },
    );
  };

  return {
    setKey,
    writeKeys(edits) {
      return applyOperation(context, "set_keys", { keys: edits });
    },
    async travel(direction) {
      const state = getState();
      if (!canTravel(state, direction)) {
        return { ok: false, message: `Nothing to ${direction} now` };
      }
      const { changes } = (direction === "undo" ? state.history.past : state.history.future).at(-1)!;
      dispatch({ type: "historyTravel", direction });
      // Live: the keyboard follows through the one write path (ADR 0018).
      if (!state.batchMode) return send({ settingNow: changes.map(({ item }) => item) });
      // Draft: RGB settings the step changed go to the keyboard at once (ADR 0019).
      if (context.realtime.enabled()) context.realtime.schedule();
      return { ok: true };
    },
    applyBatch(options) {
      return send(options);
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
