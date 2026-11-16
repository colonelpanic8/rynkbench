// The io's settings: combo, morse and fork slots, macros, behavior, morse
// profiles, hold-trigger positions and pointing. In Draft each changes what
// you want (ADR 0018); in Live each is an optimistic single-value write that
// the device's answer settles.

import type { ComboDefinition, Fork, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import type { FieldValue, WorkbenchAction, WritableField } from "../model/workbench-state";
import { FIELD_STATE_KEY } from "../model/workbench-state";
import { errorMessage } from "../session/errors";
import type { IoContext, IoWriteResult, WorkbenchIo } from "./io";

type SettingsIo = Pick<
  WorkbenchIo,
  | "setSlot"
  | "setBehavior"
  | "setMorseHoldTriggerPositions"
  | "reloadPointingConfig"
>;

export function settingsIo(context: IoContext): SettingsIo {
  const { session, getState, dispatch, draft } = context;
  const whole = (kind: "macros" | "behavior" | "holdTriggerPositions", value: unknown) => draft([{ item: { kind }, value }]);

  /** Run one optimistic write: `start` narrates the intent, then the device
   *  answer settles it as `ok` or `err`. Every single-value write below is
   *  this shape; only the dispatches differ. */
  const settle = (
    write: Promise<unknown>,
    ok: () => void,
    err: (message: string) => void,
  ): Promise<IoWriteResult> =>
    write.then(
      () => {
        ok();
        return { ok: true } as const;
      },
      (error: unknown) => {
        const message = errorMessage(error);
        err(message);
        return { ok: false, message } as const;
      },
    );

  const writeField = <F extends WritableField>(
    field: F,
    value: FieldValue<F>,
    write: () => Promise<unknown>,
  ): Promise<IoWriteResult> => {
    const prev = getState()[FIELD_STATE_KEY[field]] as FieldValue<F>;
    dispatch({ type: "fieldWriteStart", field, value } as WorkbenchAction);
    return settle(
      write(),
      () => dispatch({ type: "fieldWriteOk", field }),
      (message) => dispatch({ type: "fieldWriteErr", field, prev, message } as WorkbenchAction),
    );
  };

  return {
    setSlot(kind, index, value) {
      if (getState().batchMode) {
        dispatch({ type: "slotStage", kind, index, value });
        return Promise.resolve({ ok: true });
      }
      const prev = getState()[kind][index];
      dispatch({ type: "slotWriteStart", kind, index, value });
      const write =
        kind === "combos"
          ? session.combos.set(index, value as ComboDefinition)
          : kind === "morse"
            ? session.morse.set(index, value as Morse)
            : session.forks.set(index, value as Fork);
      return settle(
        write,
        () => dispatch({ type: "slotWriteOk", kind, index }),
        (message) => dispatch({ type: "slotWriteErr", kind, index, prev, message }),
      );
    },
    setBehavior(config) {
      const drafted = whole("behavior", config);
      if (drafted) return Promise.resolve(drafted);
      return writeField("behavior", config, () => session.behavior.set(config));
    },
    setMorseHoldTriggerPositions(positions) {
      const drafted = whole("holdTriggerPositions", positions);
      if (drafted) return Promise.resolve(drafted);
      return writeField("morseHoldTriggerPositions", positions, () =>
        session.behavior.setHoldTriggerPositions(positions),
      );
    },
    async reloadPointingConfig() {
      if (getState().pointingBusy) {
        return { ok: false, message: "a pointing write is already running" };
      }
      dispatch({ type: "pointingWriteStart" });
      try {
        const config = await session.pointing.get();
        dispatch({ type: "pointingReloaded", config });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "pointingWriteErr", message });
        return { ok: false, message };
      }
    },
  };
}
