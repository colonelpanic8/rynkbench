import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";

const CLIPBOARD_KIND = "rynkbench/key-action";
const CLIPBOARD_VERSION = 1;

interface KeyActionClipboardPayload {
  kind: typeof CLIPBOARD_KIND;
  version: typeof CLIPBOARD_VERSION;
  action: KeyAction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isModifiers(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const fields = [
    "left_ctrl",
    "left_shift",
    "left_alt",
    "left_gui",
    "right_ctrl",
    "right_shift",
    "right_alt",
    "right_gui",
  ];
  return fields.every((field) => typeof value[field] === "boolean");
}

function hasSingleVariant(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 1;
}

function isKeyCode(value: unknown): boolean {
  if (!isRecord(value) || !hasSingleVariant(value)) return false;
  if ("Hid" in value) return typeof value.Hid === "string";
  if ("Consumer" in value) return typeof value.Consumer === "string";
  return "SystemControl" in value && typeof value.SystemControl === "string";
}

function isAction(value: unknown): boolean {
  if (value === "No" || value === "TriLayerLower" || value === "TriLayerUpper")
    return true;
  if (!isRecord(value) || !hasSingleVariant(value)) return false;
  if ("Key" in value) return isKeyCode(value.Key);
  if ("Modifier" in value) return isModifiers(value.Modifier);
  if ("KeyWithModifier" in value) {
    return (
      Array.isArray(value.KeyWithModifier) &&
      value.KeyWithModifier.length === 2 &&
      typeof value.KeyWithModifier[0] === "string" &&
      isModifiers(value.KeyWithModifier[1])
    );
  }
  if ("LayerOnWithModifier" in value) {
    return (
      Array.isArray(value.LayerOnWithModifier) &&
      value.LayerOnWithModifier.length === 2 &&
      isNumber(value.LayerOnWithModifier[0]) &&
      isModifiers(value.LayerOnWithModifier[1])
    );
  }
  if ("OneShotModifier" in value) return isModifiers(value.OneShotModifier);

  const stringVariants = ["OneShotKey", "Light", "KeyboardControl", "Special"];
  const stringVariant = stringVariants.find((variant) => variant in value);
  if (stringVariant) return typeof value[stringVariant] === "string";

  const numberVariants = [
    "LayerOn",
    "LayerOff",
    "LayerToggle",
    "DefaultLayer",
    "LayerToggleOnly",
    "TriggerMacro",
    "OneShotLayer",
    "User",
    "PersistentDefaultLayer",
    "Unicode",
    "Steno",
  ];
  const numberVariant = numberVariants.find((variant) => variant in value);
  return numberVariant !== undefined && isNumber(value[numberVariant]);
}

function isKeyAction(value: unknown): value is KeyAction {
  if (value === "No" || value === "Transparent") return true;
  if (!isRecord(value) || !hasSingleVariant(value)) return false;
  if ("Single" in value) return isAction(value.Single);
  if ("Tap" in value) return isAction(value.Tap);
  if ("TapHold" in value) {
    return (
      Array.isArray(value.TapHold) &&
      value.TapHold.length === 3 &&
      isAction(value.TapHold[0]) &&
      isAction(value.TapHold[1]) &&
      isNumber(value.TapHold[2])
    );
  }
  if ("Morse" in value) return isNumber(value.Morse);
  return (
    "LayerModTap" in value &&
    Array.isArray(value.LayerModTap) &&
    value.LayerModTap.length === 3 &&
    isNumber(value.LayerModTap[0]) &&
    typeof value.LayerModTap[1] === "string" &&
    typeof value.LayerModTap[2] === "string"
  );
}

export function serializeKeyAction(action: KeyAction): string {
  const payload: KeyActionClipboardPayload = {
    kind: CLIPBOARD_KIND,
    version: CLIPBOARD_VERSION,
    action,
  };
  return JSON.stringify(payload);
}

export function parseKeyActionClipboard(text: string): KeyAction | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.kind !== CLIPBOARD_KIND || parsed.version !== CLIPBOARD_VERSION)
    return null;
  return isKeyAction(parsed.action) ? parsed.action : null;
}

/** Clipboard shortcuts belong to the canvas, never to a text-editing control. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tag = element.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (element.isContentEditable) return true;
  return Boolean(
    element.closest?.(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
    ),
  );
}

export function keyClipboardShortcut(
  event: Pick<
    KeyboardEvent,
    "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key" | "target"
  >,
): "copy" | "paste" | null {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    isTextEditingTarget(event.target)
  ) {
    return null;
  }
  if (event.key.toLowerCase() === "c" && !event.shiftKey) return "copy";
  if (event.key.toLowerCase() === "v" && !event.shiftKey) return "paste";
  return null;
}
