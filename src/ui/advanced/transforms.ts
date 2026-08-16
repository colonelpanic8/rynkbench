// Keymap-wide transforms: the dual-OS Ctrl↔GUI swap and QWERTY→alternate
// alpha-layout remaps. Pure planning logic — the Transforms tab executes a
// plan through the ordinary optimistic write path.

import type {
  Action,
  ComboDefinition,
  Fork,
  HidKeyCode,
  KeyAction,
  KeyCode,
  ModifierCombination,
  Morse,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { decodeMacros, encodeMacros } from "../macros";

/** Identifier-level HID keycode substitution. */
export type HidMap = Partial<Record<HidKeyCode, HidKeyCode>>;

export interface TransformSpec {
  hid: HidMap;
  /** Also rewrite modifier combinations (the OS swap needs this). */
  modifiers?: (mods: ModifierCombination) => ModifierCombination;
}

/** Ctrl↔GUI everywhere. Its own inverse, so it maps a PC-canonical keymap to
 *  its macOS variant and back. */
export const CTRL_GUI_SWAP: TransformSpec = {
  hid: { LCtrl: "LGui", LGui: "LCtrl", RCtrl: "RGui", RGui: "RCtrl" },
  modifiers: (mods) => ({
    ...mods,
    left_ctrl: mods.left_gui,
    left_gui: mods.left_ctrl,
    right_ctrl: mods.right_gui,
    right_gui: mods.right_ctrl,
  }),
};

export type AlphaLayout = "qwerty" | "colemak" | "colemak-dh" | "dvorak";

const ALPHA_ROWS: Record<AlphaLayout, string> = {
  qwerty: "qwertyuiop asdfghjkl;' zxcvbnm,./ -=[]",
  colemak: "qwfpgjluy; arstdhneio' zxcvbkm,./ -=[]",
  "colemak-dh": "qwfpbjluy; arstgmneio' zxcdvkh,./ -=[]",
  dvorak: "',.pyfgcrl aoeuidhtns- ;qjkxbmwvz []/=",
};

const CHAR_HID: Record<string, HidKeyCode> = {
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Dot",
  "/": "Slash",
  "-": "Minus",
  "=": "Equal",
  "[": "LeftBracket",
  "]": "RightBracket",
};

function hidForChar(c: string): HidKeyCode {
  return CHAR_HID[c] ?? (c.toUpperCase() as HidKeyCode);
}

/** Keycode substitution taking a `from`-layout keymap to the `to` layout:
 *  the keycodes at each shared physical position trade places. Composed
 *  through the row tables, so any layout pair works in either direction. */
export function layoutSpec(from: AlphaLayout, to: AlphaLayout): TransformSpec {
  const hid: HidMap = {};
  const source = ALPHA_ROWS[from];
  const target = ALPHA_ROWS[to];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === " " || source[i] === target[i]) continue;
    hid[hidForChar(source[i])] = hidForChar(target[i]);
  }
  return { hid };
}

function mapHid(spec: TransformSpec, code: HidKeyCode): HidKeyCode {
  return spec.hid[code] ?? code;
}

function mapKeyCode(spec: TransformSpec, code: KeyCode): KeyCode {
  if (typeof code === "object" && "Hid" in code) {
    return { Hid: mapHid(spec, code.Hid) };
  }
  return code;
}

function mapModifiers(spec: TransformSpec, mods: ModifierCombination): ModifierCombination {
  return spec.modifiers ? spec.modifiers(mods) : mods;
}

export function mapAction(spec: TransformSpec, action: Action): Action {
  if (typeof action === "string") return action;
  if ("Key" in action) return { Key: mapKeyCode(spec, action.Key) };
  if ("Modifier" in action) return { Modifier: mapModifiers(spec, action.Modifier) };
  if ("KeyWithModifier" in action) {
    return {
      KeyWithModifier: [
        mapHid(spec, action.KeyWithModifier[0]),
        mapModifiers(spec, action.KeyWithModifier[1]),
      ],
    };
  }
  if ("LayerOnWithModifier" in action) {
    return {
      LayerOnWithModifier: [
        action.LayerOnWithModifier[0],
        mapModifiers(spec, action.LayerOnWithModifier[1]),
      ],
    };
  }
  if ("OneShotModifier" in action) {
    return { OneShotModifier: mapModifiers(spec, action.OneShotModifier) };
  }
  if ("OneShotKey" in action) return { OneShotKey: mapHid(spec, action.OneShotKey) };
  return action;
}

export function mapKeyAction(spec: TransformSpec, keyAction: KeyAction): KeyAction {
  if (typeof keyAction === "string") return keyAction;
  if ("Single" in keyAction) return { Single: mapAction(spec, keyAction.Single) };
  if ("Tap" in keyAction) return { Tap: mapAction(spec, keyAction.Tap) };
  if ("TapHold" in keyAction) {
    return {
      TapHold: [
        mapAction(spec, keyAction.TapHold[0]),
        mapAction(spec, keyAction.TapHold[1]),
        keyAction.TapHold[2],
      ],
    };
  }
  if ("LayerModTap" in keyAction) {
    const [layer, modifier, hid] = keyAction.LayerModTap;
    const mapped = spec.hid[modifier as unknown as HidKeyCode];
    return {
      LayerModTap: [
        layer,
        mapped ? (mapped as unknown as typeof modifier) : modifier,
        mapHid(spec, hid),
      ],
    };
  }
  return keyAction;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface KeyEdit {
  layer: number;
  row: number;
  col: number;
  after: KeyAction;
}

export interface SlotEdit<T> {
  index: number;
  after: T;
}

export interface TransformPlan {
  keys: KeyEdit[];
  combos: SlotEdit<ComboDefinition>[];
  morse: SlotEdit<Morse>[];
  forks: SlotEdit<Fork>[];
  /** Re-encoded macro region, when any step changed. */
  macroBytes: Uint8Array | null;
}

export function planSize(plan: TransformPlan): number {
  return (
    plan.keys.length +
    plan.combos.length +
    plan.morse.length +
    plan.forks.length +
    (plan.macroBytes ? 1 : 0)
  );
}

export interface TransformInput {
  layers: KeyAction[][];
  cols: number;
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
}

function planKeys(
  layers: KeyAction[][],
  cols: number,
  spec: TransformSpec,
  targetLayers: number[] | null,
): KeyEdit[] {
  const edits: KeyEdit[] = [];
  layers.forEach((cells, layer) => {
    if (targetLayers && !targetLayers.includes(layer)) return;
    cells.forEach((keyAction, offset) => {
      const after = mapKeyAction(spec, keyAction);
      if (!same(keyAction, after)) {
        edits.push({ layer, row: Math.floor(offset / cols), col: offset % cols, after });
      }
    });
  });
  return edits;
}

function mapCombo(spec: TransformSpec, combo: ComboDefinition): ComboDefinition {
  if ("Actions" in combo) {
    return {
      Actions: {
        actions: combo.Actions.actions.map((a) => mapKeyAction(spec, a)),
        output: mapKeyAction(spec, combo.Actions.output),
        layer: combo.Actions.layer,
      },
    };
  }
  return {
    Positions: { ...combo.Positions, output: mapKeyAction(spec, combo.Positions.output) },
  };
}

function mapFork(spec: TransformSpec, fork: Fork): Fork {
  return {
    ...fork,
    trigger: mapKeyAction(spec, fork.trigger),
    negative_output: mapKeyAction(spec, fork.negative_output),
    positive_output: mapKeyAction(spec, fork.positive_output),
    kept_modifiers: mapModifiers(spec, fork.kept_modifiers),
  };
}

function mapMorse(spec: TransformSpec, morse: Morse): Morse {
  return {
    ...morse,
    actions: morse.actions.map(([pattern, action]) => [pattern, mapAction(spec, action)]),
  };
}

function planSlots<T>(slots: T[], map: (value: T) => T): SlotEdit<T>[] {
  const edits: SlotEdit<T>[] = [];
  slots.forEach((value, index) => {
    const after = map(value);
    if (!same(value, after)) edits.push({ index, after });
  });
  return edits;
}

/** The OS swap touches everything an action can live in: every layer's keys,
 *  combos, morse slots, forks, and macro steps. */
export function planOsSwap(input: TransformInput): TransformPlan {
  const spec = CTRL_GUI_SWAP;
  const macros = decodeMacros(input.macroBytes);
  const mappedMacros = macros.map((macro) => ({
    steps: macro.steps.map((step) =>
      step.kind === "tap" || step.kind === "press" || step.kind === "release"
        ? { ...step, code: mapHid(spec, step.code) }
        : step,
    ),
  }));
  const macroBytes = same(macros, mappedMacros) ? null : encodeMacros(mappedMacros);
  return {
    keys: planKeys(input.layers, input.cols, spec, null),
    combos: planSlots(input.combos, (combo) => mapCombo(spec, combo)),
    morse: planSlots(input.morse, (morse) => mapMorse(spec, morse)),
    forks: planSlots(input.forks, (fork) => mapFork(spec, fork)),
    macroBytes,
  };
}

/** How one layer travels across a layout switch. */
export type LayerMigration =
  | "positional" // the layer is tied to physical positions; leave it alone
  | "alphas" // substitute letter keycodes in place (alpha and autoshift layers)
  | "mnemonic"; // move whole bindings so they stay on the same letter

/** The keycode a position "means" for layout purposes: the letter it types,
 *  looking through tap-holds and modifier wrappers. */
export function primaryHid(keyAction: KeyAction): HidKeyCode | null {
  const fromAction = (action: Action): HidKeyCode | null => {
    if (typeof action === "string") return null;
    if ("Key" in action && typeof action.Key === "object" && "Hid" in action.Key) {
      return action.Key.Hid;
    }
    if ("KeyWithModifier" in action) return action.KeyWithModifier[0];
    if ("OneShotKey" in action) return action.OneShotKey;
    return null;
  };
  if (typeof keyAction === "string") return null;
  if ("Single" in keyAction) return fromAction(keyAction.Single);
  if ("Tap" in keyAction) return fromAction(keyAction.Tap);
  if ("TapHold" in keyAction) return fromAction(keyAction.TapHold[0]);
  if ("LayerModTap" in keyAction) return keyAction.LayerModTap[2];
  return null;
}

/** Switch the keymap from one alpha layout to another, migrating each layer
 *  in its chosen way. "Alphas" layers get the keycode substitution;
 *  "mnemonic" layers get their bindings moved along the permutation the
 *  substitution induces on the alpha reference layer — a shortcut bound
 *  where C sits today ends up where C sits afterwards. The reference is the
 *  first layer marked "alphas" (that's where the letters live), falling
 *  back to the default layer. Combos and forks match by action, so they
 *  follow the letters without rewriting. */
export function planLayoutSwitch(
  input: TransformInput,
  from: AlphaLayout,
  to: AlphaLayout,
  migrations: LayerMigration[],
  defaultLayer: number,
): TransformPlan {
  const spec = layoutSpec(from, to);
  const alphaLayer = migrations.findIndex((migration) => migration === "alphas");
  const base = input.layers[alphaLayer >= 0 ? alphaLayer : defaultLayer] ?? [];

  // Where each letter of the switch's domain currently sits on the base layer.
  const positionOf = new Map<HidKeyCode, number>();
  base.forEach((keyAction, offset) => {
    const hid = primaryHid(keyAction);
    if (hid && spec.hid[hid] !== undefined && !positionOf.has(hid)) {
      positionOf.set(hid, offset);
    }
  });

  const keys: KeyEdit[] = [];
  input.layers.forEach((cells, layer) => {
    const migration = migrations[layer] ?? "positional";
    if (migration === "positional") return;
    if (migration === "alphas") {
      keys.push(...planKeys([cells], input.cols, spec, null).map((edit) => ({ ...edit, layer })));
      return;
    }
    // Mnemonic: the new binding at a position is the old binding of the
    // letter that will live there. Positions outside the switch's domain —
    // thumbs, F-row, letters the base layer doesn't carry — stay put.
    cells.forEach((keyAction, offset) => {
      const baseHid = primaryHid(base[offset] ?? "No");
      const incoming = baseHid !== null ? spec.hid[baseHid] : undefined;
      if (incoming === undefined) return;
      const source = positionOf.get(incoming);
      if (source === undefined) return;
      const after = cells[source];
      if (!same(keyAction, after)) {
        keys.push({
          layer,
          row: Math.floor(offset / input.cols),
          col: offset % input.cols,
          after,
        });
      }
    });
  });

  return { keys, combos: [], morse: [], forks: [], macroBytes: null };
}
