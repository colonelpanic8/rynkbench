import { useMemo, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { Button, SectionLabel } from "../kit";
import { useWorkbench } from "../state";
import {
  GLOVE80_CONNECTION_KEYS,
  connectionKeyAction,
  installGlove80StatusRules,
  replaceBatteryBar,
  replaceBleStatus,
  replaceUsbStatus,
  writeGlove80StatusSetup,
} from "./statusPresets";

const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;

function keyAt(keys: KeyView[], row: number, col: number): KeyView | undefined {
  return keys.find((key) => key.row === row && key.col === col);
}

export function StatusPresetsPanel() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const status = bundle.runtimeConditionalStatus;
  const defaultLayer = bundle.caps.num_layers > 2 ? 2 : state.currentLayer;
  const [layer, setLayer] = useState(defaultLayer);
  const [node, setNode] = useState(0);
  const [kind, setKind] = useState<"ble" | "usb">("ble");
  const [slot, setSlot] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const selectedKeys = useMemo(() => {
    const byLed = new Map(
      bundle.model.keys
        .filter((key): key is KeyView & { ledId: number } => key.ledId !== undefined)
        .map((key) => [key.ledId, key]),
    );
    return state.lightingSelection.flatMap((led) => {
      const key = byLed.get(led);
      return key ? [key] : [];
    });
  }, [bundle.model.keys, state.lightingSelection]);

  const selectedKey = selectedKeys.length === 1 ? selectedKeys[0] : null;
  const selectedBar = selectedKeys.length === 5
    ? [...selectedKeys]
        .sort((a, b) => b.shape.rect.y - a.shape.rect.y || a.shape.rect.x - b.shape.rect.x)
        .map((key) => key.ledId!)
    : null;

  if (status === null) return null;

  const predicatesSupported =
    ((bundle.lightingCaps?.features ?? 0) & RUNTIME_EFFECTS_CONDITIONS) !== 0;
  const exactKeys = GLOVE80_CONNECTION_KEYS.map((preset) => ({
    preset,
    key: keyAt(bundle.model.keys, preset.row, preset.col),
  }));
  const glove80Available =
    bundle.model.name.toLowerCase().includes("glove80") &&
    bundle.caps.num_layers > 2 &&
    bundle.caps.num_split_peripherals > 0 &&
    bundle.caps.num_ble_profiles >= 3 &&
    exactKeys.every(({ preset, key }) => key?.ledId === preset.led);

  const applyRules = async (rules: typeof state.runtimeConditionalDraft, success: string) => {
    if (rules.length > status.capacity) {
      setMessage(`This setup needs ${rules.length} rules; the keyboard holds ${status.capacity}.`);
      return false;
    }
    setMessage("Installing and verifying…");
    const result = await io.applyConditionalScenes(rules);
    setMessage(result.ok ? success : `Installation failed: ${result.message}`);
    return result.ok;
  };

  const installGlove80 = async () => {
    const rules = installGlove80StatusRules(state.runtimeConditionalDraft);
    if (rules.length > status.capacity) {
      setMessage(`The complete Glove80 setup needs ${rules.length} rules; this keyboard holds ${status.capacity}.`);
      return;
    }
    setMessage("Installing and verifying…");
    const result = await writeGlove80StatusSetup(
      {
        setKey: (preset, action) =>
          io.setKey(preset.layer, preset.row, preset.col, action, { history: "invalidate" }),
        applyRules: (next) => io.applyConditionalScenes(next),
      },
      state.runtimeConditionalDraft,
    );
    setMessage(
      result.ok
        ? "Installed and verified Magic-layer battery bars, three Bluetooth profile keys, and the USB status key."
        : `Installation failed: ${result.message}`,
    );
  };

  const installConnectionKey = async () => {
    if (!selectedKey || selectedKey.ledId === undefined) return;
    const connectionKind = kind === "ble" ? { type: "ble" as const, slot } : { type: "usb" as const };
    const rules = kind === "ble"
      ? replaceBleStatus(state.runtimeConditionalDraft, layer, selectedKey.ledId, slot)
      : replaceUsbStatus(state.runtimeConditionalDraft, layer, selectedKey.ledId);
    setMessage("Installing and verifying…");
    const keyResult = await io.setKey(
      layer,
      selectedKey.row,
      selectedKey.col,
      connectionKeyAction(connectionKind),
      { history: "invalidate" },
    );
    if (!keyResult.ok) {
      setMessage(`Installation failed: ${keyResult.message}`);
      return;
    }
    await applyRules(
      rules,
      kind === "ble"
        ? `Bound and verified Bluetooth slot ${slot + 1} with status lighting.`
        : "Bound and verified USB output with status lighting.",
    );
  };

  const installBatteryBar = async () => {
    if (!selectedBar) return;
    const rules = replaceBatteryBar(state.runtimeConditionalDraft, {
      layer,
      node,
      leds: selectedBar,
    });
    if (await applyRules(rules, `Installed and verified a five-segment battery bar for node ${node}.`)) {
      dispatch({ type: "lightingSelect", leds: [] });
    }
  };

  return (
    <div>
      <SectionLabel>Status setup</SectionLabel>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Bind connection actions and install their ordered status-light rules together. Presets
        replace matching rules on the chosen keys, so running them again is safe.
      </p>

      {glove80Available && predicatesSupported && (
        <div className="mt-2 rounded-lg border border-accent-deep/40 bg-accent-dim/15 p-3">
          <div className="text-[12.5px] font-medium text-ink">Glove80 Magic status cluster</div>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Layer 2: two five-key battery bars, Bluetooth slots 1–3 on the lower left thumb arc,
            and USB on the upper thumb key. Green is active, blue selected/idle, blinking white
            advertising, red bonded-idle, and gray empty.
          </p>
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={state.lightingBusy}
            onClick={installGlove80}
          >
            Install complete Glove80 setup
          </Button>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-line-soft bg-well p-3">
        <div className="text-[12.5px] font-medium text-ink">Connection key</div>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Use Select above and choose one lit key on the board, then bind its action and indicator.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-faint">
            Action
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as "ble" | "usb")}
              className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
            >
              <option value="ble">Bluetooth profile</option>
              <option value="usb">USB output</option>
            </select>
          </label>
          {kind === "ble" ? (
            <label className="text-[11px] text-faint">
              Profile
              <select
                value={slot}
                onChange={(event) => setSlot(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
              >
                {Array.from({ length: bundle.caps.num_ble_profiles }, (_, index) => (
                  <option key={index} value={index}>Slot {index + 1}</option>
                ))}
              </select>
            </label>
          ) : <div />}
          <label className="text-[11px] text-faint">
            Layer
            <select
              value={layer}
              onChange={(event) => setLayer(Number(event.target.value))}
              className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
            >
              {Array.from({ length: bundle.caps.num_layers }, (_, index) => (
                <option key={index} value={index}>Layer {index}</option>
              ))}
            </select>
          </label>
        </div>
        <Button
          variant="outline"
          className="mt-2 w-full"
          disabled={!predicatesSupported || selectedKey === null || state.lightingBusy}
          onClick={installConnectionKey}
        >
          {selectedKey ? `Configure ${selectedKey.label ?? `r${selectedKey.row},c${selectedKey.col}`}` : "Select one key"}
        </Button>
      </div>

      <div className="mt-2 rounded-lg border border-line-soft bg-well p-3">
        <div className="text-[12.5px] font-medium text-ink">Five-segment battery bar</div>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Select five keys. Their physical bottom-to-top order becomes 20%, 40%, 60%, 80%, and
          100%; low levels turn amber/red and charging turns blue.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-faint">
            Battery node
            <select
              value={node}
              onChange={(event) => setNode(Number(event.target.value))}
              className="mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
            >
              {Array.from({ length: 1 + bundle.caps.num_split_peripherals }, (_, index) => (
                <option key={index} value={index}>{index === 0 ? "Central · 0" : `Peripheral · ${index}`}</option>
              ))}
            </select>
          </label>
        </div>
        <Button
          variant="outline"
          className="mt-2 w-full"
          disabled={selectedBar === null || state.lightingBusy}
          onClick={installBatteryBar}
        >
          {selectedBar ? `Install node ${node} bar` : `Select five keys (${selectedKeys.length}/5)`}
        </Button>
      </div>

      {!predicatesSupported && (
        <p className="mt-2 text-[11px] leading-relaxed text-warn">
          This firmware can store battery rules but not connection predicates; update it before
          installing Bluetooth or USB status keys.
        </p>
      )}
      {message && <p className="mt-2 text-[11px] leading-relaxed text-mute">{message}</p>}
    </div>
  );
}
