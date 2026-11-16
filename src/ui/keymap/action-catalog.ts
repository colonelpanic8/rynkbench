// The curated system and lighting actions, with plain-language hints: shared
// by the key editor's Pick Key and the full action editor.

import type { KeyboardAction, LightAction } from "../../model/action-types";

/** System control actions, curated with plain-language hints. */
export const SYSTEM_ACTIONS: Array<{
  id: KeyboardAction;
  label: string;
  hint: string;
  danger?: boolean;
}> = [
  { id: "OutputUsb", label: "Output · USB", hint: "Prefer typing over USB" },
  { id: "OutputBluetooth", label: "Output · Bluetooth", hint: "Prefer typing over BLE" },
  { id: "ComboToggle", label: "Combos · toggle", hint: "Enable/disable combo processing" },
  { id: "ComboOn", label: "Combos · on", hint: "Enable combo processing" },
  { id: "ComboOff", label: "Combos · off", hint: "Disable combo processing" },
  { id: "CapsWordToggle", label: "Caps Word", hint: "Capitalize until the next word break" },
  { id: "Bootloader", label: "Bootloader", hint: "Reboot into flashing mode", danger: true },
  { id: "Reboot", label: "Reboot", hint: "Restart the keyboard", danger: true },
  {
    id: "ClearEeprom",
    label: "Clear EEPROM",
    hint: "Wipe stored settings back to firmware defaults",
    danger: true,
  },
];

/** Every lighting action currently exposed by the generated RMK protocol. */
export const LIGHT_ACTIONS: Array<{ id: LightAction; label: string; hint: string }> = [
  { id: "BacklightOn", label: "Output on", hint: "Select the always-on output policy" },
  { id: "BacklightOff", label: "Output off", hint: "Select the always-off output policy" },
  { id: "BacklightToggle", label: "Output toggle", hint: "Toggle all composed lighting" },
  { id: "OutputModeCycle", label: "Output policy cycle", hint: "Cycle always on, always off, and powered-only" },
  { id: "BacklightDown", label: "Output brightness −", hint: "Dim all composed lighting" },
  { id: "BacklightUp", label: "Output brightness +", hint: "Brighten all composed lighting" },
  { id: "BacklightStep", label: "Output brightness step", hint: "Advance brightness, wrapping at the top" },
  { id: "BacklightToggleBreathing", label: "Background breathing toggle", hint: "Switch the standard background between solid and breathing" },
  { id: "RgbTog", label: "Background toggle", hint: "Enable or disable the background source" },
  { id: "RgbModeForward", label: "Effect →", hint: "Next extension effect or background mode" },
  { id: "RgbModeReverse", label: "Effect ←", hint: "Previous extension effect or background mode" },
  { id: "RgbHui", label: "Palette / hue +", hint: "Next extension palette or raise background hue" },
  { id: "RgbHud", label: "Palette / hue −", hint: "Previous extension palette or lower background hue" },
  { id: "RgbSai", label: "Saturation +", hint: "Raise background saturation" },
  { id: "RgbSad", label: "Saturation −", hint: "Lower background saturation" },
  { id: "RgbVai", label: "Effect brightness +", hint: "Raise extension or background brightness" },
  { id: "RgbVad", label: "Effect brightness −", hint: "Lower extension or background brightness" },
  { id: "RgbSpi", label: "Effect speed +", hint: "Speed up extension or background animation" },
  { id: "RgbSpd", label: "Effect speed −", hint: "Slow down extension or background animation" },
  { id: "RgbModePlain", label: "Mode · plain", hint: "Select the standard solid background" },
  { id: "RgbModeBreathe", label: "Mode · breathe", hint: "Select the standard breathing background" },
  { id: "RgbModeRainbow", label: "Mode · rainbow", hint: "Select rainbow when the installed extension supports it" },
  { id: "RgbModeSwirl", label: "Mode · swirl", hint: "Select swirl when the installed extension supports it" },
  { id: "RgbModeSnake", label: "Mode · snake", hint: "Select snake when the installed extension supports it" },
  { id: "RgbModeKnight", label: "Mode · knight", hint: "Select knight when the installed extension supports it" },
  { id: "RgbModeXmas", label: "Mode · Xmas", hint: "Select Xmas when the installed extension supports it" },
  { id: "RgbModeGradient", label: "Mode · gradient", hint: "Select gradient when the installed extension supports it" },
  { id: "RgbModeRgbtest", label: "Mode · RGB test", hint: "Select RGB test when the installed extension supports it" },
  { id: "RgbModeTwinkle", label: "Mode · twinkle", hint: "Select twinkle when the installed extension supports it" },
];
