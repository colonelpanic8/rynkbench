// The io's settings: combo, morse and fork slots (staged in Draft), macros,
// behavior, morse profiles, hold-trigger positions and pointing. Each is an
// optimistic single-value write that the device's answer settles.

import type { ComboDefinition, Fork, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import type { FieldValue, WorkbenchAction, WritableField } from "../model/workbench-state";
import { FIELD_STATE_KEY } from "../model/workbench-state";
import { normalizePointingConfig, pointingConfigsEqual } from "../model/pointing";
import { errorMessage } from "../session/errors";
import { pointingDraftDirty } from "./draft/selectors";
import type { IoContext, IoWriteResult, WorkbenchIo } from "./io";

type SettingsIo = Pick<
  WorkbenchIo,
  | "setSlot"
  | "writeMacros"
  | "setBehavior"
  | "setMorseProfile"
  | "deleteMorseProfile"
  | "setMorseHoldTriggerPositions"
  | "applyPointingConfig"
  | "reloadPointingConfig"
>;

export function settingsIo(context: IoContext): SettingsIo {
  const { session, getState, dispatch } = context;

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
    writeMacros(bytes) {
      return writeField("macros", bytes, () => session.macros.write(bytes));
    },
    setBehavior(config) {
      return writeField("behavior", config, () => session.behavior.set(config));
    },
    setMorseProfile(entry) {
      const prev = getState().morseProfiles.find((item) => item.index === entry.index) ?? null;
      dispatch({ type: "morseProfileWriteStart", entry });
      return settle(
        session.behavior.setProfile(entry),
        () => dispatch({ type: "morseProfileWriteOk", index: entry.index }),
        (message) =>
          dispatch({ type: "morseProfileWriteErr", index: entry.index, prev, message }),
      );
    },
    deleteMorseProfile(index) {
      const state = getState();
      const entry = state.morseProfiles.find((item) => item.index === index);
      if (!entry) return Promise.resolve({ ok: false, message: `no profile in slot ${index}` });
      const positions = state.morseHoldTriggerPositions;
      dispatch({ type: "morseProfileDeleteStart", index });
      return settle(
        session.behavior.deleteProfile(index),
        () => dispatch({ type: "morseProfileDeleteOk", index }),
        (message) => dispatch({ type: "morseProfileDeleteErr", entry, positions, message }),
      );
    },
    setMorseHoldTriggerPositions(positions) {
      return writeField("morseHoldTriggerPositions", positions, () =>
        session.behavior.setHoldTriggerPositions(positions),
      );
    },
    async applyPointingConfig() {
      const state = getState();
      if (state.pointingBusy) return { ok: false, message: "a pointing write is already running" };
      if (!state.pointingConfig || !state.pointingDraft) {
        return { ok: false, message: "this keyboard has no runtime pointing configuration" };
      }
      if (!pointingDraftDirty(state)) return { ok: true };

      dispatch({ type: "pointingWriteStart" });
      try {
        const request = normalizePointingConfig({
          ...state.pointingDraft,
          revision: state.pointingConfig.revision,
        });
        const accepted = await session.pointing.set(request);
        const readback = await session.pointing.get();
        if (accepted.revision !== readback.revision || !pointingConfigsEqual(accepted, readback)) {
          throw new Error("pointing configuration read-back did not match the accepted write");
        }
        dispatch({ type: "pointingWriteOk", config: readback });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "pointingWriteErr", message });
        return { ok: false, message };
      }
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
