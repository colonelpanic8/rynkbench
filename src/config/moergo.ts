// MoErgo Layout Editor JSON ↔ Rynk keymap conversion.
//
// Editor backups are ZMK behavior trees in an 80-key physical walk, while
// Rynk uses row-major typed actions over the 6x14 matrix. Only behavior with a
// faithful Rynk equivalent is converted; errors name the exact physical key.

import type {
  Action,
  HidKeyCode,
  KeyAction,
  ModifierCombination,
} from "../vendor/rynk-wasm/rynk_wasm";

export const MOERGO_TO_MATRIX = [
  0, 1, 2, 3, 4, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 50, 51, 52, 53, 54, 55,
  56, 57, 58, 59, 60, 61, 6, 20, 34, 35, 21, 7, 64, 65, 66, 67, 68, 69,
  70, 71, 72, 73, 74, 48, 62, 76, 77, 63, 49, 79, 80, 81, 82, 83,
] as const;

type JsonObject = Record<string, unknown>;

export interface MoergoImport {
  layers: KeyAction[][];
  layerNames: string[];
  /** Original document, retained so export preserves editor-only sections. */
  template: JsonObject;
}

const EMPTY_MODS: ModifierCombination = {
  left_ctrl: false,
  left_shift: false,
  left_alt: false,
  left_gui: false,
  right_ctrl: false,
  right_shift: false,
  right_alt: false,
  right_gui: false,
};

const HID_NAMES: Record<string, HidKeyCode> = {
  RET: "Enter", RETURN: "Enter", ESC: "Escape", ESCAPE: "Escape",
  BSPC: "Backspace", BACKSPACE: "Backspace", TAB: "Tab", SPACE: "Space",
  MINUS: "Minus", EQUAL: "Equal", LBKT: "LeftBracket", LEFT_BRACKET: "LeftBracket",
  RBKT: "RightBracket", RIGHT_BRACKET: "RightBracket", BSLH: "Backslash",
  BACKSLASH: "Backslash", SEMI: "Semicolon", SEMICOLON: "Semicolon",
  SQT: "Quote", SINGLE_QUOTE: "Quote", GRAVE: "Grave", COMMA: "Comma",
  DOT: "Dot", FSLH: "Slash", SLASH: "Slash", CAPS: "CapsLock",
  CAPSLOCK: "CapsLock", PRINTSCREEN: "PrintScreen", SCROLLLOCK: "ScrollLock",
  PAUSE_BREAK: "Pause", INS: "Insert", INSERT: "Insert", HOME: "Home",
  PG_UP: "PageUp", PAGE_UP: "PageUp", DEL: "Delete", DELETE: "Delete", END: "End",
  PG_DN: "PageDown", PAGE_DOWN: "PageDown", RIGHT: "Right", RIGHT_ARROW: "Right",
  LEFT: "Left", LEFT_ARROW: "Left", DOWN: "Down", DOWN_ARROW: "Down",
  UP: "Up", UP_ARROW: "Up", KP_NUM: "NumLock", KP_NUMLOCK: "NumLock",
  KP_SLASH: "KpSlash", KP_DIVIDE: "KpSlash", KP_MULTIPLY: "KpAsterisk",
  KP_MINUS: "KpMinus", KP_PLUS: "KpPlus", KP_ENTER: "KpEnter", KP_DOT: "KpDot",
  KP_EQUAL: "KpEqual", K_APP: "Application", K_APPLICATION: "Application",
  LCTRL: "LCtrl", LEFT_CONTROL: "LCtrl", LSHFT: "LShift", LSHIFT: "LShift",
  LEFT_SHIFT: "LShift", LALT: "LAlt", LEFT_ALT: "LAlt", LGUI: "LGui",
  LEFT_GUI: "LGui", RCTRL: "RCtrl", RIGHT_CONTROL: "RCtrl", RSHFT: "RShift",
  RSHIFT: "RShift", RIGHT_SHIFT: "RShift", RALT: "RAlt", RIGHT_ALT: "RAlt",
  RGUI: "RGui", RIGHT_GUI: "RGui", C_POWER: "SystemPower", C_SLEEP: "SystemSleep",
  C_MUTE: "AudioMute", C_VOL_UP: "AudioVolUp", C_VOL_DN: "AudioVolDown",
  C_NEXT: "MediaNextTrack", C_PREV: "MediaPrevTrack", C_STOP: "MediaStop",
  C_PP: "MediaPlayPause", K_PLAY_PAUSE: "MediaPlayPause", C_EJECT: "MediaEject",
  K_EJECT: "MediaEject", C_BRI_UP: "BrightnessUp", C_BRI_DN: "BrightnessDown",
  K_MUTE: "KbMute", K_VOLUME_UP: "KbVolumeUp", K_VOL_UP: "KbVolumeUp",
  K_VOLUME_DOWN: "KbVolumeDown", K_VOL_DN: "KbVolumeDown",
};

const HID_TO_EDITOR: Partial<Record<HidKeyCode, string>> = Object.fromEntries(
  Object.entries(HID_NAMES).map(([editor, hid]) => [hid, editor]),
);

for (let code = 65; code <= 90; code += 1) HID_NAMES[String.fromCharCode(code)] = String.fromCharCode(code) as HidKeyCode;
for (let n = 1; n <= 9; n += 1) {
  HID_NAMES[`N${n}`] = `Kc${n}` as HidKeyCode;
  HID_NAMES[`NUMBER_${n}`] = `Kc${n}` as HidKeyCode;
  HID_NAMES[`KP_N${n}`] = `Kp${n}` as HidKeyCode;
  HID_NAMES[`KP_NUMBER_${n}`] = `Kp${n}` as HidKeyCode;
}
HID_NAMES.N0 = "Kc0";
HID_NAMES.NUMBER_0 = "Kc0";
HID_NAMES.KP_N0 = "Kp0";
HID_NAMES.KP_NUMBER_0 = "Kp0";
for (let n = 1; n <= 24; n += 1) HID_NAMES[`F${n}`] = `F${n}` as HidKeyCode;

const SHIFTED: Record<string, HidKeyCode> = {
  EXCL: "Kc1", EXCLAMATION: "Kc1", AT: "Kc2", AT_SIGN: "Kc2", HASH: "Kc3",
  DLLR: "Kc4", DOLLAR: "Kc4", PRCNT: "Kc5", PERCENT: "Kc5", CARET: "Kc6",
  AMPS: "Kc7", AMPERSAND: "Kc7", STAR: "Kc8", ASTERISK: "Kc8",
  LPAR: "Kc9", LEFT_PARENTHESIS: "Kc9", RPAR: "Kc0", RIGHT_PARENTHESIS: "Kc0",
  UNDER: "Minus", UNDERSCORE: "Minus", PLUS: "Equal", LBRC: "LeftBracket",
  LEFT_BRACE: "LeftBracket", RBRC: "RightBracket", RIGHT_BRACE: "RightBracket",
  PIPE: "Backslash", COLON: "Semicolon", DQT: "Quote", DOUBLE_QUOTES: "Quote",
  TILDE: "Grave", LT: "Comma", LESS_THAN: "Comma", GT: "Dot",
  GREATER_THAN: "Dot", QMARK: "Slash", QUESTION: "Slash",
};

const MODIFIER_KEYS: Partial<Record<HidKeyCode, keyof ModifierCombination>> = {
  LCtrl: "left_ctrl", LShift: "left_shift", LAlt: "left_alt", LGui: "left_gui",
  RCtrl: "right_ctrl", RShift: "right_shift", RAlt: "right_alt", RGui: "right_gui",
};

function object(value: unknown, message: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as JsonObject;
}

function layoutObject(root: JsonObject): JsonObject {
  return "keymap" in root ? object(root.keymap, "MoErgo keymap wrapper must be an object") : root;
}

function location(layer: number, editorIndex: number, cols: number): string {
  const offset = MOERGO_TO_MATRIX[editorIndex];
  return `layer ${layer}, editor key ${editorIndex} (r${Math.floor(offset / cols)},c${offset % cols})`;
}

function params(binding: JsonObject, here: string): unknown[] {
  if (!("params" in binding)) return [];
  if (!Array.isArray(binding.params)) throw new Error(`${here} params must be an array`);
  return binding.params.map((param) => {
    if (param !== null && typeof param === "object" && !Array.isArray(param) && "value" in param)
      return (param as JsonObject).value;
    return param;
  });
}

function stringParam(value: unknown, here: string): string {
  if (typeof value !== "string") throw new Error(`${here} parameter must be a string`);
  return value;
}

function layerParam(value: unknown, here: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255)
    throw new Error(`${here} layer parameter must be an integer from 0 to 255`);
  return parsed;
}

function modsWith(...keys: (keyof ModifierCombination)[]): ModifierCombination {
  const result = { ...EMPTY_MODS };
  for (const key of keys) result[key] = true;
  return result;
}

function mergeMods(a: ModifierCombination, b: ModifierCombination): ModifierCombination {
  return {
    left_ctrl: a.left_ctrl || b.left_ctrl,
    left_shift: a.left_shift || b.left_shift,
    left_alt: a.left_alt || b.left_alt,
    left_gui: a.left_gui || b.left_gui,
    right_ctrl: a.right_ctrl || b.right_ctrl,
    right_shift: a.right_shift || b.right_shift,
    right_alt: a.right_alt || b.right_alt,
    right_gui: a.right_gui || b.right_gui,
  };
}

function keycodeAction(text: string): Action {
  const trimmed = text.trim();
  const call = /^([A-Za-z]+)\((.*)\)$/.exec(trimmed);
  if (call) {
    const mod = ({ LC: "left_ctrl", LS: "left_shift", LA: "left_alt", LG: "left_gui",
      RC: "right_ctrl", RS: "right_shift", RA: "right_alt", RG: "right_gui" } as const)[call[1].toUpperCase() as "LC"];
    if (!mod) throw new Error(`unsupported ZMK keycode function '${call[1]}'`);
    const inner = keycodeAction(call[2]);
    if (typeof inner === "object" && "Key" in inner && "Hid" in inner.Key)
      return { KeyWithModifier: [inner.Key.Hid, modsWith(mod)] };
    if (typeof inner === "object" && "KeyWithModifier" in inner) {
      const [key, mods] = inner.KeyWithModifier;
      return { KeyWithModifier: [key, mergeMods(mods, modsWith(mod))] };
    }
    throw new Error(`modifier function '${call[1]}' requires a HID key`);
  }
  const upper = trimmed.toUpperCase();
  if (SHIFTED[upper]) return { KeyWithModifier: [SHIFTED[upper], modsWith("left_shift")] };
  const hid = HID_NAMES[upper];
  if (!hid) throw new Error(`unknown MoErgo/ZMK keycode '${text}'`);
  return { Key: { Hid: hid } };
}

function holdAction(text: string): Action {
  const action = keycodeAction(text);
  if (typeof action === "object" && "Key" in action && "Hid" in action.Key) {
    const modifier = MODIFIER_KEYS[action.Key.Hid];
    if (modifier) return { Modifier: modsWith(modifier) };
  }
  return action;
}

function bindingToAction(
  raw: unknown,
  layerNames: string[],
  layer: number,
  editorIndex: number,
  cols: number,
): KeyAction {
  const here = location(layer, editorIndex, cols);
  const binding = object(raw, `${here} must be a binding object`);
  if (typeof binding.value !== "string") throw new Error(`${here} binding has no string value`);
  const behavior = binding.value;
  const p = params(binding, here);
  const exact = (count: number) => {
    if (p.length !== count) throw new Error(`${here} ${behavior} expects ${count} parameter(s)`);
  };
  const namedLayer = (name: string) => {
    const target = layerNames.indexOf(name);
    if (target < 0) throw new Error(`${here} ${behavior} needs a layer named exactly '${name}'`);
    return target;
  };

  switch (behavior) {
    case "&none": exact(0); return "No";
    case "&trans": exact(0); return "Transparent";
    case "&kp": exact(1); return { Single: keycodeAction(stringParam(p[0], here)) };
    case "&mt": exact(2); return { TapHold: [keycodeAction(stringParam(p[1], here)), holdAction(stringParam(p[0], here)), 200] };
    case "&lt": exact(2); return { TapHold: [keycodeAction(stringParam(p[1], here)), { LayerOn: layerParam(p[0], here) }, 200] };
    case "&mo": exact(1); return { Single: { LayerOn: layerParam(p[0], here) } };
    case "&to": exact(1); return { Single: { LayerToggleOnly: layerParam(p[0], here) } };
    case "&tog": exact(1); return { Single: { LayerToggle: layerParam(p[0], here) } };
    case "&sl": exact(1); return { Single: { OneShotLayer: layerParam(p[0], here) } };
    case "&layer": exact(1); return { Single: { LayerOn: layerParam(p[0], here) } };
    case "&sk": {
      exact(1);
      const action = holdAction(stringParam(p[0], here));
      if (typeof action !== "object" || !("Modifier" in action)) throw new Error(`${here} &sk supports modifier keys only in Rynk`);
      return { Single: { OneShotModifier: action.Modifier } };
    }
    case "&caps_word": exact(0); return { Single: { KeyboardControl: "CapsWordToggle" } };
    case "&key_repeat": exact(0); return { Single: { Special: "Repeat" } };
    case "&reset": case "&sys_reset": exact(0); return { Single: { KeyboardControl: "Reboot" } };
    case "&bootloader":
      exact(0);
      return MOERGO_TO_MATRIX[editorIndex] % cols >= 7
        ? { Single: { User: 12 } }
        : { Single: { KeyboardControl: "Bootloader" } };
    case "&magic": exact(0); return { Single: { LayerOn: namedLayer("Magic") } };
    case "&lower": exact(0); return { Single: { LayerOn: namedLayer("Lower") } };
  }
  if (/^&bt_[0-3]$/.test(behavior)) {
    exact(0);
    return { Single: { User: Number(behavior.at(-1)) } };
  }
  if (behavior === "&bt") {
    exact(1);
    const command = stringParam(p[0], here);
    if (command === "BT_CLR") return { Single: { User: 10 } };
    if (command === "BT_CLR_ALL") return { Single: { User: 11 } };
    throw new Error(`${here} unsupported Bluetooth command '${command}'`);
  }
  if (behavior === "&out") {
    exact(1);
    const command = stringParam(p[0], here);
    if (command === "OUT_USB") return { Single: { KeyboardControl: "OutputUsb" } };
    if (command === "OUT_BLE") return { Single: { KeyboardControl: "OutputBluetooth" } };
    throw new Error(`${here} unsupported output command '${command}'`);
  }
  if (behavior === "&rgb_ug") {
    exact(1);
    const light = ({ RGB_TOG: "RgbTog", RGB_HUI: "RgbHui", RGB_HUD: "RgbHud",
      RGB_SAI: "RgbSai", RGB_SAD: "RgbSad", RGB_BRI: "RgbVai", RGB_BRD: "RgbVad",
      RGB_SPI: "RgbSpi", RGB_SPD: "RgbSpd", RGB_EFF: "RgbModeForward",
      RGB_EFR: "RgbModeReverse" } as const)[stringParam(p[0], here) as "RGB_TOG"];
    if (!light) throw new Error(`${here} unsupported RGB command '${String(p[0])}'`);
    return { Single: { Light: light } };
  }
  if (behavior === "&mkp" || behavior === "&mmv" || behavior === "&msc") {
    exact(1);
    const token = stringParam(p[0], here);
    const hid = ({ LCLK: "MouseBtn1", MB1: "MouseBtn1", RCLK: "MouseBtn2", MB2: "MouseBtn2",
      MCLK: "MouseBtn3", MB3: "MouseBtn3", MB4: "MouseBtn4", MB5: "MouseBtn5",
      MOVE_UP: "MouseUp", MOVE_DOWN: "MouseDown", MOVE_LEFT: "MouseLeft", MOVE_RIGHT: "MouseRight",
      SCRL_UP: "MouseWheelUp", SCRL_DOWN: "MouseWheelDown", SCRL_LEFT: "MouseWheelLeft",
      SCRL_RIGHT: "MouseWheelRight" } as const)[token as "LCLK"];
    if (!hid) throw new Error(`${here} unsupported mouse command '${token}'`);
    return { Single: { Key: { Hid: hid } } };
  }
  throw new Error(`${here} behavior '${behavior}' cannot be represented by the Rynk runtime keymap`);
}

export function parseMoergoJson(text: string, rows: number, cols: number): MoergoImport {
  if (rows !== 6 || cols !== 14) throw new Error(`MoErgo Glove80 JSON needs a 6x14 matrix; device reports ${rows}x${cols}`);
  const parsed: unknown = JSON.parse(text);
  const template = object(parsed, "MoErgo JSON root must be an object");
  const layout = layoutObject(template);
  if (typeof layout.keyboard === "string" && layout.keyboard.toLowerCase() !== "glove80")
    throw new Error(`MoErgo JSON is for keyboard '${layout.keyboard}', expected 'glove80'`);
  if (!Array.isArray(layout.layer_names)) throw new Error("MoErgo JSON has no layer_names array");
  if (!Array.isArray(layout.layers)) throw new Error("MoErgo JSON has no layers array");
  if (layout.layer_names.length !== layout.layers.length)
    throw new Error(`MoErgo JSON has ${layout.layer_names.length} layer name(s) but ${layout.layers.length} layer array(s)`);
  const layerNames = layout.layer_names.map((name, index) => {
    if (typeof name !== "string") throw new Error(`layer_names[${index}] must be a string`);
    return name;
  });
  const layers = layout.layers.map((rawLayer, layer) => {
    if (!Array.isArray(rawLayer)) throw new Error(`layers[${layer}] must be an array`);
    if (rawLayer.length !== 80) throw new Error(`layer ${layer} (${layerNames[layer]}) has ${rawLayer.length} keys; expected 80`);
    const matrix = Array<KeyAction>(rows * cols).fill("No");
    rawLayer.forEach((binding, editorIndex) => {
      matrix[MOERGO_TO_MATRIX[editorIndex]] = bindingToAction(binding, layerNames, layer, editorIndex, cols);
    });
    return matrix;
  });
  return { layers, layerNames, template: structuredClone(template) };
}

function parameter(value: unknown): JsonObject {
  return { value, params: [] };
}

function binding(value: string, ...values: unknown[]): JsonObject {
  return values.length === 0 ? { value } : { value, params: values.map(parameter) };
}

function modifierNames(mods: ModifierCombination): string[] {
  return [
    mods.left_ctrl && "LC", mods.left_shift && "LS", mods.left_alt && "LA", mods.left_gui && "LG",
    mods.right_ctrl && "RC", mods.right_shift && "RS", mods.right_alt && "RA", mods.right_gui && "RG",
  ].filter((value): value is string => Boolean(value));
}

function hidToEditor(hid: HidKeyCode): string {
  if (/^[A-Z]$/.test(hid) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(hid)) return hid;
  if (/^Kc[0-9]$/.test(hid)) return `N${hid.slice(2)}`;
  if (/^Kp[0-9]$/.test(hid)) return `KP_N${hid.slice(2)}`;
  const name = HID_TO_EDITOR[hid];
  if (!name) throw new Error(`HID key '${hid}' has no MoErgo editor spelling`);
  return name;
}

function modifiedCode(key: HidKeyCode, mods: ModifierCombination): string {
  let result = hidToEditor(key);
  for (const name of modifierNames(mods).reverse()) result = `${name}(${result})`;
  return result;
}

function actionToCode(action: Action): string {
  if (typeof action === "object" && "Key" in action && "Hid" in action.Key) return hidToEditor(action.Key.Hid);
  if (typeof action === "object" && "KeyWithModifier" in action) return modifiedCode(...action.KeyWithModifier);
  if (typeof action === "object" && "Modifier" in action) {
    const names = modifierNames(action.Modifier);
    if (names.length === 0) throw new Error("empty modifier action");
    const key = ({ LC: "LCTRL", LS: "LSHFT", LA: "LALT", LG: "LGUI",
      RC: "RCTRL", RS: "RSHFT", RA: "RALT", RG: "RGUI" } as const)[names.pop() as "LC"];
    return names.reverse().reduce((inner, wrapper) => `${wrapper}(${inner})`, key);
  }
  throw new Error("action is not a MoErgo keycode parameter");
}

function actionToBinding(action: KeyAction, offset: number): JsonObject {
  if (action === "No") return binding("&none");
  if (action === "Transparent") return binding("&trans");
  if (typeof action === "object" && "TapHold" in action) {
    const [tap, hold] = action.TapHold;
    if (typeof hold === "object" && "LayerOn" in hold) return binding("&lt", hold.LayerOn, actionToCode(tap));
    return binding("&mt", actionToCode(hold), actionToCode(tap));
  }
  if (typeof action === "object" && "Tap" in action) return binding("&kp", actionToCode(action.Tap));
  if (typeof action !== "object" || !("Single" in action)) throw new Error("morse actions need an editor behavior definition");
  const single = action.Single;
  if (typeof single === "object" && ("Key" in single || "KeyWithModifier" in single || "Modifier" in single))
    return binding("&kp", actionToCode(single));
  if (typeof single === "object" && "LayerOn" in single) return binding("&mo", single.LayerOn);
  if (typeof single === "object" && "LayerToggleOnly" in single) return binding("&to", single.LayerToggleOnly);
  if (typeof single === "object" && "LayerToggle" in single) return binding("&tog", single.LayerToggle);
  if (typeof single === "object" && "OneShotLayer" in single) return binding("&sl", single.OneShotLayer);
  if (typeof single === "object" && "OneShotModifier" in single) return binding("&sk", actionToCode({ Modifier: single.OneShotModifier }));
  if (typeof single === "object" && "KeyboardControl" in single) {
    if (single.KeyboardControl === "Bootloader") return binding("&bootloader");
    if (single.KeyboardControl === "Reboot") return binding("&reset");
    if (single.KeyboardControl === "CapsWordToggle") return binding("&caps_word");
    if (single.KeyboardControl === "OutputUsb") return binding("&out", "OUT_USB");
    if (single.KeyboardControl === "OutputBluetooth") return binding("&out", "OUT_BLE");
  }
  if (typeof single === "object" && "Special" in single && single.Special === "Repeat") return binding("&key_repeat");
  if (typeof single === "object" && "Light" in single) {
    const command = ({ RgbTog: "RGB_TOG", RgbModeForward: "RGB_EFF", RgbModeReverse: "RGB_EFR",
      RgbHui: "RGB_HUI", RgbHud: "RGB_HUD", RgbSai: "RGB_SAI", RgbSad: "RGB_SAD",
      RgbVai: "RGB_BRI", RgbVad: "RGB_BRD", RgbSpi: "RGB_SPI", RgbSpd: "RGB_SPD" } as const)[single.Light as "RgbTog"];
    if (command) return binding("&rgb_ug", command);
  }
  if (typeof single === "object" && "User" in single) {
    if (single.User >= 0 && single.User <= 3) return binding(`&bt_${single.User}`);
    if (single.User === 10) return binding("&bt", "BT_CLR");
    if (single.User === 11) return binding("&bt", "BT_CLR_ALL");
    if (single.User === 12 && offset % 14 >= 7) return binding("&bootloader");
  }
  throw new Error(`runtime action ${JSON.stringify(action)} has no MoErgo editor representation`);
}

function defaultDocument(): JsonObject {
  return {
    keyboard: "glove80", firmware_api_version: "1", locale: "en-US", uuid: "",
    parent_uuid: "", unlisted: true, date: Math.floor(Date.now() / 1000), creator: "",
    title: "Rynkbench export", notes: "", tags: [], custom_defined_behaviors: "",
    custom_devicetree: "", config_parameters: [], layout_parameters: {}, macros: [],
    holdTaps: [], combos: [], inputListeners: [], layer_names: [], layers: [],
  };
}

export function serializeMoergoJson(
  layers: KeyAction[][],
  options: { layerNames?: string[]; template?: JsonObject } = {},
): string {
  const root = structuredClone(options.template ?? defaultDocument());
  const layout = layoutObject(root);
  layout.keyboard = "glove80";
  const oldNames = Array.isArray(layout.layer_names) ? layout.layer_names : [];
  layout.layer_names = layers.map((_, index) =>
    options.layerNames?.[index] ?? (typeof oldNames[index] === "string" ? oldNames[index] : `Layer ${index}`),
  );
  layout.layers = layers.map((matrix, layer) => {
    if (matrix.length !== 84) throw new Error(`layer ${layer} has ${matrix.length} cells; expected 84`);
    return MOERGO_TO_MATRIX.map((offset, editorIndex) => {
      try {
        return actionToBinding(matrix[offset], offset);
      } catch (error) {
        throw new Error(`${location(layer, editorIndex, 14)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
  return `${JSON.stringify(root, null, 2)}\n`;
}
