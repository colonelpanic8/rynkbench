// The binding editor shown in the inspector for a selected key or encoder
// direction. Category tabs → pick → commit(action).

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  Action,
  HidKeyCode,
  KeyAction,
  KeyboardAction,
  LightAction,
  ModifierCombination,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { searchKeycodes } from "../hid";
import { EMPTY_MODS, actionLabel, anyModifier, hidName, modifierSymbols } from "../labels";
import { decodeMacros, macroPreview } from "../macros";
import { morsePatternGlyph } from "../morse";
import { useWorkbench } from "../state";
import { Button, SectionLabel, TextInput, cx } from "../kit";

type Tab =
  | "keys"
  | "mods"
  | "layers"
  | "behavior"
  | "advanced"
  | "macros"
  | "morse"
  | "system"
  | "lighting";

const BASE_TABS: Array<{ id: Tab; label: string }> = [
  { id: "keys", label: "Keys" },
  { id: "mods", label: "Mods" },
  { id: "layers", label: "Layers" },
  { id: "behavior", label: "Behavior" },
  { id: "advanced", label: "Tap-hold" },
];

function Keycap({
  children,
  onClick,
  title,
  active,
  wide,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md border px-1.5 font-mono text-[12px]",
        "transition-all duration-120 active:translate-y-px",
        wide && "px-2.5",
        active
          ? "border-accent bg-accent-dim/40 text-accent"
          : "border-line bg-raised text-ink hover:border-line-strong hover:bg-hover",
      )}
    >
      {children}
    </button>
  );
}

const MOD_FIELDS: Array<{ key: keyof ModifierCombination; label: string; sym: string }> = [
  { key: "left_ctrl", label: "L Ctrl", sym: "⌃" },
  { key: "left_alt", label: "L Alt", sym: "⌥" },
  { key: "left_shift", label: "L Shift", sym: "⇧" },
  { key: "left_gui", label: "L Gui", sym: "⌘" },
  { key: "right_ctrl", label: "R Ctrl", sym: "⌃" },
  { key: "right_alt", label: "R Alt", sym: "⌥" },
  { key: "right_shift", label: "R Shift", sym: "⇧" },
  { key: "right_gui", label: "R Gui", sym: "⌘" },
];

export function ModGrid({
  mods,
  onChange,
}: {
  mods: ModifierCombination;
  onChange: (next: ModifierCombination) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {MOD_FIELDS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange({ ...mods, [f.key]: !mods[f.key] })}
          className={cx(
            "flex cursor-pointer flex-col items-center rounded-md border py-1.5 transition-colors duration-120",
            mods[f.key]
              ? "border-accent bg-accent-dim/40 text-accent"
              : "border-line bg-raised text-mute hover:border-line-strong",
          )}
        >
          <span className="text-[14px] leading-none">{f.sym}</span>
          <span className="mt-0.5 text-[9.5px] uppercase tracking-wide">{f.label}</span>
        </button>
      ))}
    </div>
  );
}

export function KeycodeBrowser({
  query,
  onQuery,
  onPick,
  compact,
}: {
  query: string;
  onQuery: (q: string) => void;
  onPick: (code: HidKeyCode) => void;
  compact?: boolean;
}) {
  const groups = useMemo(() => searchKeycodes(query), [query]);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TextInput
        placeholder="Search keycodes…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <div
        className={cx(
          "flex min-h-0 flex-col gap-3 overflow-y-auto pr-1",
          compact ? "max-h-56" : "flex-1",
        )}
      >
        {groups.length === 0 && (
          <div className="py-6 text-center text-[12.5px] text-faint">
            No keycodes match “{query}”.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.name}>
            <SectionLabel>{g.name}</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {g.entries.map((e) => (
                <Keycap key={e.code} title={hidName(e.code)} onClick={() => onPick(e.code)}>
                  {e.label}
                </Keycap>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type LayerKind = "LayerOn" | "LayerToggle" | "DefaultLayer" | "OneShotLayer" | "LayerToggleOnly";

const LAYER_KINDS: Array<{ id: LayerKind; label: string; hint: string }> = [
  { id: "LayerOn", label: "Momentary", hint: "Active while held (MO)" },
  { id: "LayerToggle", label: "Toggle", hint: "Tap to toggle on/off (TG)" },
  { id: "DefaultLayer", label: "Default", hint: "Set the default layer (DF)" },
  { id: "OneShotLayer", label: "One-shot", hint: "Active for the next key (OSL)" },
  { id: "LayerToggleOnly", label: "To-layer", hint: "Activate this layer only (TO)" },
];

function LayerPicker({
  numLayers,
  onPick,
}: {
  numLayers: number;
  onPick: (action: Action) => void;
}) {
  const [kind, setKind] = useState<LayerKind>("LayerOn");
  const hint = LAYER_KINDS.find((k) => k.id === kind)?.hint;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {LAYER_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={cx(
              "cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-120",
              kind === k.id
                ? "border-accent bg-accent-dim/40 text-accent"
                : "border-line text-mute hover:border-line-strong hover:text-ink",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="text-[11.5px] text-faint">{hint}</div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: numLayers }, (_, n) => (
          <Keycap key={n} wide onClick={() => onPick({ [kind]: n } as unknown as Action)}>
            L{n}
          </Keycap>
        ))}
      </div>
    </div>
  );
}

/** Mini action picker for tap-hold slots — also reused by the advanced
 *  editors (morse pattern actions) that commit a bare `Action`. */
export function SlotPicker({
  numLayers,
  onPick,
}: {
  numLayers: number;
  onPick: (action: Action) => void;
}) {
  const [tab, setTab] = useState<"keys" | "mods" | "layers">("keys");
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<ModifierCombination>(EMPTY_MODS);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-well/60 p-2.5">
      <div className="flex gap-1">
        {(["keys", "mods", "layers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "cursor-pointer rounded-md px-2 py-1 text-[11.5px] font-medium capitalize transition-colors duration-120",
              tab === t ? "bg-raised text-ink" : "text-faint hover:text-mute",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "keys" && (
        <KeycodeBrowser
          compact
          query={query}
          onQuery={setQuery}
          onPick={(code) => onPick({ Key: { Hid: code } })}
        />
      )}
      {tab === "mods" && (
        <div className="flex flex-col gap-2.5">
          <ModGrid mods={mods} onChange={setMods} />
          <Button
            variant="primary"
            disabled={!anyModifier(mods)}
            onClick={() => onPick({ Modifier: mods })}
          >
            Use {modifierSymbols(mods) || "modifier"}
          </Button>
        </div>
      )}
      {tab === "layers" && <LayerPicker numLayers={numLayers} onPick={onPick} />}
    </div>
  );
}

function TapHoldEditor({
  current,
  numLayers,
  onCommit,
}: {
  current: KeyAction;
  numLayers: number;
  onCommit: (action: KeyAction) => void;
}) {
  const initial =
    typeof current === "object" && "TapHold" in current ? current.TapHold : null;
  const [tap, setTap] = useState<Action>(initial?.[0] ?? "No");
  const [hold, setHold] = useState<Action>(initial?.[1] ?? "No");
  const [timeout_, setTimeout_] = useState<number>(initial?.[2] ?? 200);
  const [slot, setSlot] = useState<"tap" | "hold">("tap");

  const slotButton = (which: "tap" | "hold", value: Action) => (
    <button
      type="button"
      onClick={() => setSlot(which)}
      className={cx(
        "flex flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-colors duration-120",
        slot === which
          ? "border-accent bg-accent-dim/30"
          : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {which}
      </span>
      <span className={cx("font-mono text-[13px]", value === "No" ? "text-faint" : "text-ink")}>
        {actionLabel(value) || "unset"}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11.5px] text-faint">
        One action on tap, another on hold. Pick a slot, then choose its action.
      </div>
      <div className="flex gap-2">
        {slotButton("tap", tap)}
        {slotButton("hold", hold)}
      </div>
      <SlotPicker
        numLayers={numLayers}
        onPick={(a) => (slot === "tap" ? setTap(a) : setHold(a))}
      />
      <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
        Hold timeout
        <span className="flex items-center gap-1.5">
          <TextInput
            type="number"
            min={50}
            max={2000}
            value={timeout_}
            onChange={(e) => setTimeout_(Number(e.target.value))}
            className="w-20 text-right"
          />
          <span className="text-faint">ms</span>
        </span>
      </label>
      <Button
        variant="primary"
        disabled={tap === "No" && hold === "No"}
        onClick={() => onCommit({ TapHold: [tap, hold, timeout_] })}
      >
        Bind tap-hold
      </Button>
    </div>
  );
}

/** System control actions, curated with plain-language hints. */
const SYSTEM_ACTIONS: Array<{
  id: KeyboardAction;
  label: string;
  hint: string;
  danger?: boolean;
}> = [
  { id: "OutputAuto", label: "Output · Auto", hint: "Route typing over USB when present, else BLE" },
  { id: "OutputUsb", label: "Output · USB", hint: "Force typing over USB" },
  { id: "OutputBluetooth", label: "Output · Bluetooth", hint: "Force typing over BLE" },
  { id: "ComboToggle", label: "Combos · toggle", hint: "Enable/disable combo processing" },
  { id: "ComboOn", label: "Combos · on", hint: "Enable combo processing" },
  { id: "ComboOff", label: "Combos · off", hint: "Disable combo processing" },
  { id: "CapsWordToggle", label: "Caps Word", hint: "Capitalize until the next word break" },
  { id: "DebugToggle", label: "Debug toggle", hint: "Toggle firmware debug output" },
  { id: "Bootloader", label: "Bootloader", hint: "Reboot into flashing mode", danger: true },
  { id: "Reboot", label: "Reboot", hint: "Restart the keyboard", danger: true },
  {
    id: "ClearEeprom",
    label: "Clear EEPROM",
    hint: "Wipe stored settings back to firmware defaults",
    danger: true,
  },
];

/** The useful lighting actions, curated — full RGB-mode zoo omitted. */
const LIGHT_ACTIONS: Array<{ id: LightAction; label: string; hint: string }> = [
  { id: "RgbTog", label: "RGB toggle", hint: "Lighting on/off" },
  { id: "RgbModeForward", label: "Mode →", hint: "Next lighting mode" },
  { id: "RgbModeReverse", label: "Mode ←", hint: "Previous lighting mode" },
  { id: "RgbHui", label: "Hue +", hint: "Shift hue forward" },
  { id: "RgbHud", label: "Hue −", hint: "Shift hue back" },
  { id: "RgbSai", label: "Sat +", hint: "More saturated" },
  { id: "RgbSad", label: "Sat −", hint: "Less saturated" },
  { id: "RgbVai", label: "Bright +", hint: "Raise brightness" },
  { id: "RgbVad", label: "Bright −", hint: "Lower brightness" },
  { id: "RgbSpi", label: "Speed +", hint: "Faster animation" },
  { id: "RgbSpd", label: "Speed −", hint: "Slower animation" },
];

function PickList<T extends string>({
  items,
  onPick,
}: {
  items: Array<{ id: T; label: string; hint: string; danger?: boolean }>;
  onPick: (id: T) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          className={cx(
            "cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-120",
            item.danger
              ? "border-danger/35 bg-danger-dim/15 hover:border-danger/60"
              : "border-line bg-raised hover:border-line-strong",
          )}
        >
          <div
            className={cx("text-[13px] font-medium", item.danger ? "text-danger" : "text-ink")}
          >
            {item.label}
          </div>
          <div className="text-[11.5px] text-faint">{item.hint}</div>
        </button>
      ))}
    </div>
  );
}

function MacroPickerTab({ onCommit }: { onCommit: (action: KeyAction) => void }) {
  const { state } = useWorkbench();
  const macros = useMemo(() => decodeMacros(state.macroBytes), [state.macroBytes]);
  if (macros.length === 0) {
    return (
      <div className="py-6 text-center text-[12.5px] leading-relaxed text-faint">
        No macros defined yet.
        <br />
        Create them in Advanced → Macros.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
      {macros.map((macro, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onCommit({ Single: { TriggerMacro: n } })}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2 text-left transition-colors duration-120 hover:border-line-strong"
        >
          <span className="rounded-md border border-cap-edge bg-cap px-1.5 py-0.5 font-mono text-[11.5px] text-cap-ink">
            M{n}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-mute">
            {macroPreview(macro)}
          </span>
        </button>
      ))}
    </div>
  );
}

function MorsePickerTab({ onCommit }: { onCommit: (action: KeyAction) => void }) {
  const { state } = useWorkbench();
  const configured = state.morse
    .map((m, n) => ({ morse: m, n }))
    .filter(({ morse }) => morse.actions.length > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="text-[11.5px] leading-relaxed text-faint">
        Bind a morse (tap-dance) slot to this key. Edit patterns in Advanced → Morse.
      </div>
      {configured.length === 0 ? (
        <div className="py-4 text-center text-[12.5px] text-faint">
          No morse slots configured yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
          {configured.map(({ morse, n }) => (
            <button
              key={n}
              type="button"
              onClick={() => onCommit({ Morse: n })}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2 text-left transition-colors duration-120 hover:border-line-strong"
            >
              <span className="rounded-md border border-cap-edge bg-cap px-1.5 py-0.5 font-mono text-[11.5px] text-cap-ink">
                Mo{n}
              </span>
              <span className="tnum text-[12.5px] text-mute">
                {morse.actions.length} pattern{morse.actions.length === 1 ? "" : "s"}
              </span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-faint">
                {morse.actions
                  .slice(0, 3)
                  .map(([p]) => morsePatternGlyph(p))
                  .join("  ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionEditor({
  current,
  numLayers,
  onCommit,
}: {
  current: KeyAction;
  numLayers: number;
  onCommit: (action: KeyAction) => void;
}) {
  const { bundle } = useWorkbench();
  const [tab, setTab] = useState<Tab>("keys");
  const [query, setQuery] = useState("");
  const [keyMods, setKeyMods] = useState<ModifierCombination>(EMPTY_MODS);
  const [oneShot, setOneShot] = useState(false);

  const tabs = useMemo(() => {
    const out = [...BASE_TABS];
    if (bundle.caps.macro_space_size > 0) out.push({ id: "macros", label: "Macros" });
    if (bundle.caps.max_morse > 0) out.push({ id: "morse", label: "Morse" });
    out.push({ id: "system", label: "System" }, { id: "lighting", label: "Lighting" });
    return out;
  }, [bundle.caps.macro_space_size, bundle.caps.max_morse]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "flex-1 cursor-pointer whitespace-nowrap rounded-md px-1.5 py-1.5 text-[11.5px] font-medium transition-colors duration-120",
              tab === t.id ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div>
            <SectionLabel>With modifiers</SectionLabel>
            <div className="mt-1.5">
              <ModGrid mods={keyMods} onChange={setKeyMods} />
            </div>
            {anyModifier(keyMods) && (
              <div className="mt-1.5 text-[11.5px] text-accent">
                Next key binds as {modifierSymbols(keyMods)} + key
              </div>
            )}
          </div>
          <KeycodeBrowser
            query={query}
            onQuery={setQuery}
            onPick={(code) => {
              if (anyModifier(keyMods)) {
                onCommit({ Single: { KeyWithModifier: [code, keyMods] } });
              } else {
                onCommit({ Single: { Key: { Hid: code } } });
              }
            }}
          />
        </div>
      )}

      {tab === "mods" && (
        <div className="flex flex-col gap-3">
          <div className="text-[11.5px] text-faint">
            Bind a modifier combination to this key.
          </div>
          <ModGrid mods={keyMods} onChange={setKeyMods} />
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-mute">
            <input
              type="checkbox"
              checked={oneShot}
              onChange={(e) => setOneShot(e.target.checked)}
              className="accent-(--color-accent)"
            />
            One-shot (applies to the next keypress)
          </label>
          <Button
            variant="primary"
            disabled={!anyModifier(keyMods)}
            onClick={() =>
              onCommit({
                Single: oneShot ? { OneShotModifier: keyMods } : { Modifier: keyMods },
              })
            }
          >
            Bind {modifierSymbols(keyMods) || "modifier"}
          </Button>
        </div>
      )}

      {tab === "layers" && (
        <LayerPicker numLayers={numLayers} onPick={(a) => onCommit({ Single: a })} />
      )}

      {tab === "behavior" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onCommit("Transparent")}
            className="cursor-pointer rounded-lg border border-line bg-raised px-3 py-2.5 text-left transition-colors duration-120 hover:border-line-strong"
          >
            <div className="text-[13px] font-medium text-ink">▽ Transparent</div>
            <div className="text-[11.5px] text-faint">Falls through to the layer below</div>
          </button>
          <button
            type="button"
            onClick={() => onCommit("No")}
            className="cursor-pointer rounded-lg border border-line bg-raised px-3 py-2.5 text-left transition-colors duration-120 hover:border-line-strong"
          >
            <div className="text-[13px] font-medium text-ink">∅ No action</div>
            <div className="text-[11.5px] text-faint">Key does nothing on this layer</div>
          </button>
        </div>
      )}

      {tab === "advanced" && (
        <TapHoldEditor current={current} numLayers={numLayers} onCommit={onCommit} />
      )}

      {tab === "macros" && <MacroPickerTab onCommit={onCommit} />}

      {tab === "morse" && <MorsePickerTab onCommit={onCommit} />}

      {tab === "system" && (
        <PickList
          items={SYSTEM_ACTIONS}
          onPick={(id) => onCommit({ Single: { KeyboardControl: id } })}
        />
      )}

      {tab === "lighting" && (
        <PickList items={LIGHT_ACTIONS} onPick={(id) => onCommit({ Single: { Light: id } })} />
      )}
    </div>
  );
}
