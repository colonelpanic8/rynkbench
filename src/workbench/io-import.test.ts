import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { initSync as initRynkSync } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { renderDocument, snapshotFromState, type RuntimeSnapshot } from "../config/document";
import { readImport } from "../config/transfer";
import { storedSegmentsOf } from "../session/mock/board";
import { offlineGlove80Catalog, openOfflineGlove80 } from "../session/offline/glove80";
import { keymapSegments } from "../session/flash-writes";
import { RULES } from "../session/lighting-features";
import { ruleFromWire, ruleToWire } from "../session/lighting-rules";
import type { RuntimeLightingRule, RynkSession } from "../session/types";
import { encodeMacros } from "../model/macros";
import { emptyMorse } from "../model/slots";
import { addPointingDevice, normalizePointingConfig, pointingConfigsEqual } from "../model/pointing";
import { openBundle } from "../ui/bundle";
import type { ConnectedBundle, WorkbenchState } from "../model/workbench-state";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type IoOptions, type WorkbenchIo } from "./io";
import { makeWorkbenchReducer } from "./reducer";
import { draftOf } from "./draft/want";

beforeAll(() => {
  initSync({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") });
  initRynkSync({ module: readFileSync("src/vendor/rynk-wasm/rynk_wasm_bg.wasm") });
});

const catalog = offlineGlove80Catalog();
const letter = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;

interface Bench {
  session: RynkSession;
  bundle: ConnectedBundle;
  io: WorkbenchIo;
  state: () => WorkbenchState;
  /** The workbench's layout with `edit` done, as a TOML file. */
  file: (edit: (snapshot: RuntimeSnapshot) => void) => string;
  importText: (text: string) => ReturnType<WorkbenchIo["importLayout"]>;
}

async function onBoard(
  session: RynkSession,
  draft: boolean,
  check: (bench: Bench) => Promise<void>,
  options: Partial<IoOptions> & {
    /** What the connect-time read found, changed before the workbench opens. */
    connected?: (bundle: ConnectedBundle) => void;
    /** The bundle changed after the workbench opened (what the file is checked against). */
    prepare?: (bundle: ConnectedBundle) => void;
  } = {},
) {
  try {
    const bundle = await openBundle(session);
    options.connected?.(bundle);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle), ...options,
    });
    options.prepare?.(bundle);
    const file = (edit: (snapshot: RuntimeSnapshot) => void) => {
      const snapshot = structuredClone(snapshotFromState(state));
      edit(snapshot);
      return renderDocument(snapshot, catalog, "toml");
    };
    const importText = (text: string) => io.importLayout(readImport({ text, bundle, state, catalog }));
    await check({ session, bundle, io, state: () => state, file, importText });
  } finally {
    await session.close();
  }
}

/** A simulated Glove80 holding only what a TOML file round-trips (a file
 *  cannot say a zero prior-idle time: it reads back as the default). */
const simulated = async () => {
  const session = openOfflineGlove80();
  await session.behavior.set({ ...(await session.behavior.get()), morse_prior_idle_time_ms: 120 });
  return session;
};
const baseLayer = async (session: RynkSession) => (await session.keymap.readAll())[0].actions;

describe("importing a layout file", () => {
  it("in Draft: becomes draft changes, writes nothing until Send, and Undo takes it back as one step", async () => {
    await onBoard(await simulated(), true, async ({ session, io, state, file, importText }) => {
      const before = await baseLayer(session);
      const stored = storedSegmentsOf(session);
      const text = file((snapshot) => {
        snapshot.layers[0][0] = letter("Q");
        snapshot.layers[1][20] = letter("W");
      });

      const { layout, written } = await importText(text);
      expect(written).toEqual({ ok: true });
      expect(layout.changedKeys).toBe(2);
      expect(await baseLayer(session)).toEqual(before);
      expect(storedSegmentsOf(session)).toBe(stored);
      expect(draftOf(state()).changes.map(({ item }) => item)).toEqual([
        { kind: "key", layer: 0, offset: 0 },
        { kind: "key", layer: 1, offset: 20 },
      ]);
      expect(state().history.past).toHaveLength(1);

      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(draftOf(state()).changes).toEqual([]);
      expect(state().history.past).toEqual([]);
    });
  });

  it("in Live: stores only the changed rows, and the keyboard reads back as the file", async () => {
    await onBoard(await simulated(), false, async ({ session, bundle, state, file, importText }) => {
      const cols = bundle.caps.num_cols;
      const stored = storedSegmentsOf(session);
      let wanted: KeyAction[][] = [];
      const text = file((snapshot) => {
        // Two keys in one row of the base layer, one in a row of layer 1.
        snapshot.layers[0][0] = letter("Q");
        snapshot.layers[0][1] = letter("W");
        snapshot.layers[1][cols * 2 + 3] = letter("E");
        wanted = snapshot.layers;
      });

      const { layout, written } = await importText(text);
      expect(written).toEqual({ ok: true });
      expect(layout.changedKeys).toBe(3);
      expect(storedSegmentsOf(session) - stored).toBe(2 * keymapSegments(0, cols, cols));
      const read = await session.keymap.readAll();
      expect(wanted.map((_, layer) => read.find((entry) => entry.layer === layer)!.actions)).toEqual(wanted);
      expect(draftOf(state()).changes).toEqual([]);
      expect(state().history.past).toHaveLength(1);
    });
  });

  it("stores nothing when the file is the layout the keyboard already holds", async () => {
    await onBoard(await simulated(), false, async ({ session, state, file, importText }) => {
      const stored = storedSegmentsOf(session);
      const setRows = vi.spyOn(session.keymap, "setRows");
      const { layout, written } = await importText(file(() => {}));
      expect(written).toEqual({ ok: true });
      expect(layout).toMatchObject({ changedKeys: 0, applied: [], skipped: [] });
      expect(setRows).not.toHaveBeenCalled();
      expect(storedSegmentsOf(session)).toBe(stored);
      expect(state().history.past).toEqual([]);
    });
  });

  it("leaves a drafted setting the file does not describe in the draft", async () => {
    await onBoard(await simulated(), true, async ({ session, io, state, file, importText }) => {
      const timing = { ...state().behavior!, combo_timeout_ms: state().behavior!.combo_timeout_ms + 7 };
      expect(await io.setBehavior(timing)).toEqual({ ok: true });
      const macros = encodeMacros([{ steps: [{ kind: "tap", code: "A" }] }]);
      const text = file((snapshot) => {
        snapshot.behaviors!.config = undefined;
        snapshot.behaviors!.macros = macros;
      });

      const { layout, written } = await importText(text);
      expect(written).toEqual({ ok: true });
      expect(layout.applied).toEqual(["1 macro slots"]);
      expect(draftOf(state()).changes.map(({ item }) => item.kind).sort()).toEqual(["behavior", "macros"]);
      expect(await session.macros.read()).not.toEqual(macros);

      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(await session.behavior.get()).toEqual(timing);
      expect(await session.macros.read()).toEqual(macros);
    });
  });

  it("writes the behaviors imported keys use before the keys", async () => {
    await onBoard(await simulated(), false, async ({ session, state, file, importText }) => {
      const slot = 3;
      expect(state().morse[slot].actions).toEqual([]);
      const morse: Morse = {
        ...emptyMorse(),
        profile: { ...emptyMorse().profile, mode: "Normal", hold_timeout_ms: 200 },
        actions: [[0b10, { Key: { Hid: "Tab" } }]],
      };
      const macros = encodeMacros([{ steps: [{ kind: "tap", code: "B" }] }]);
      const order: string[] = [];
      const record = <T extends object, K extends keyof T>(target: T, method: K, name: string) => {
        const original = (target[method] as (...args: unknown[]) => Promise<unknown>).bind(target);
        vi.spyOn(target, method as never).mockImplementation(((...args: unknown[]) => {
          order.push(name);
          return original(...args);
        }) as never);
      };
      record(session.morse, "set", "morse");
      record(session.macros, "write", "macros");
      record(session.keymap, "setRows", "keys");

      const text = file((snapshot) => {
        snapshot.behaviors!.morses![slot] = morse;
        snapshot.behaviors!.macros = macros;
        snapshot.layers[0][0] = { Morse: slot } as KeyAction;
        snapshot.layers[0][1] = { Single: { TriggerMacro: 0 } } as KeyAction;
      });
      const { written } = await importText(text);
      expect(written).toEqual({ ok: true });
      expect(order.indexOf("keys")).toBeGreaterThan(-1);
      expect(order.lastIndexOf("morse")).toBeLessThan(order.indexOf("keys"));
      expect(order.lastIndexOf("macros")).toBeLessThan(order.indexOf("keys"));
      expect((await session.morse.readAll())[slot]).toEqual(morse);
    });
  });

  it("asks Guard once for the whole import, and changes nothing when it says no", async () => {
    const judge = vi.fn(async () => ({ ok: false as const, message: "Rejected, so nothing was changed", guarded: true as const }));
    await onBoard(await simulated(), false, async ({ session, state, file, importText }) => {
      const before = await baseLayer(session);
      const text = file((snapshot) => {
        snapshot.layers[0][0] = letter("Q");
        snapshot.layers[0][1] = letter("W");
        snapshot.layers[2][5] = letter("E");
      });
      const { written } = await importText(text);
      expect(written).toMatchObject({ ok: false, guarded: true });
      expect(judge).toHaveBeenCalledOnce();
      expect(await baseLayer(session)).toEqual(before);
      expect(state().history.past).toEqual([]);
      expect(draftOf(state()).changes).toEqual([]);
    }, { judge });
  });

  it("reads the pointing configuration again when the connect-time read failed, and writes the file's", async () => {
    const session = await simulated();
    const config = addPointingDevice(normalizePointingConfig(await session.pointing.get()), 2);
    await onBoard(session, false, async ({ state, file, importText }) => {
      expect(state().pointingConfig).toBeNull();
      const { layout, written } = await importText(file((snapshot) => {
        snapshot.pointing = config;
      }));
      expect(written).toEqual({ ok: true });
      expect(layout.applied).toContain("pointing configuration");
      expect(pointingConfigsEqual(await session.pointing.get(), config)).toBe(true);
      expect(pointingConfigsEqual(state().pointingConfig, config)).toBe(true);
    }, { connected: (bundle) => { bundle.pointingConfig = null; } });
  });
});

describe("importing lighting rules", () => {
  const rule: RuntimeLightingRule = {
    cell: {
      led_id: 0,
      effect: { Solid: { color: { r: 255, g: 0, b: 0 } } },
      conditions: { layer: { layer: 0, active: true }, battery: undefined, output_mode: undefined },
    },
    connection: undefined,
    effects: { enabled: true },
    layers: undefined,
    indicators: undefined,
  };

  it("writes the document's rules once and leaves an unchanged reimport alone", async () => {
    const session = openOfflineGlove80();
    let text = "";
    const replace = vi.spyOn(session.lighting.conditionalScenes, "replace");
    await onBoard(session, false, async ({ file, importText }) => {
      text = file((snapshot) => {
        snapshot.lighting!.conditional_scenes = [ruleToWire(rule)];
      });
      expect((await importText(text)).written).toEqual({ ok: true });
      expect(replace).toHaveBeenCalledExactlyOnceWith([rule]);
      replace.mockClear();
      expect((await importText(text)).written).toEqual({ ok: true });
      expect(replace).not.toHaveBeenCalled();
    });
  });

  it("imports layer-set and lock-indicator conditions on rule-only firmware", async () => {
    let wanted: RuntimeLightingRule[] = [];
    const session = openOfflineGlove80();
    await onBoard(session, false, async ({ file, importText }) => {
      const text = file((snapshot) => {
        snapshot.lighting!.conditional_scenes = [ruleToWire({
          ...rule,
          cell: { ...rule.cell, conditions: { layer: undefined, battery: undefined, output_mode: undefined } },
          effects: undefined,
          layers: { active: 2, inactive: 4 },
          indicators: { num_lock: true, caps_lock: undefined, scroll_lock: undefined },
        })];
        wanted = snapshot.lighting!.conditional_scenes.map(ruleFromWire);
      });
      expect((await importText(text)).written).toEqual({ ok: true });
      expect(await session.lighting.conditionalScenes.read()).toEqual(wanted);
    }, { prepare: (bundle) => { bundle.lightingCaps = { ...bundle.lightingCaps!, features: RULES }; } });
  });
});
