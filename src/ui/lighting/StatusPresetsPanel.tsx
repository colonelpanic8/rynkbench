import { useMemo, useState } from "react";
import type { KeyView } from "../../model/keyboard";
import { Button, SectionLabel } from "../kit";
import { keyAddressLabel, keyHoverTitle } from "../key-address";
import { layerName } from "../layer-names";
import { useWorkbench } from "../state";
import {
  BAR_ORDERS,
  GLOVE80_MAGIC_LAYER,
  connectionKeyAction,
  detectBarOrder,
  glove80ConnectionKeys,
  installGlove80StatusRules,
  orderBatteryBar,
  replaceBatteryBar,
  replaceBleStatus,
  replaceUsbStatus,
  writeGlove80StatusSetup,
} from "./statusPresets";
import type { BarOrder } from "./statusPresets";
import { layersInMask } from "./wakeLayers";

const RUNTIME_EFFECTS_CONDITIONS = 1 << 15;

const selectClass =
  "mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink";

function keyAt(keys: KeyView[], row: number, col: number): KeyView | undefined {
  return keys.find((key) => key.row === row && key.col === col);
}

export function StatusPresetsPanel() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const status = bundle.runtimeConditionalStatus;
  const numLayers = bundle.caps.num_layers;
  // Status lighting belongs on the Magic layer when one is designated; the
  // stock Glove80 config keeps it on layer 2.
  const wakeLayers = state.lightingOutputMode?.wake_layers ?? state.lightingControls.wake_layers;
  const [magicLayer] = layersInMask(wakeLayers, numLayers);
  const defaultLayer =
    magicLayer ?? (numLayers > GLOVE80_MAGIC_LAYER ? GLOVE80_MAGIC_LAYER : state.currentLayer);
  const [layer, setLayer] = useState(defaultLayer);
  const [node, setNode] = useState(0);
  const [kind, setKind] = useState<"ble" | "usb">("ble");
  const [slot, setSlot] = useState(0);
  const [order, setOrder] = useState<BarOrder | "auto">("auto");
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
  const barKeys = selectedKeys.map((key) => ({
    ledId: key.ledId!,
    x: key.shape.rect.x,
    y: key.shape.rect.y,
  }));
  const barOrder = order === "auto" ? detectBarOrder(barKeys) : order;
  const selectedBar = selectedKeys.length === 5 ? orderBatteryBar(barKeys, barOrder) : null;
  const barPreview = selectedBar?.map(
    (led) => selectedKeys.find((key) => key.ledId === led)!,
  );

  if (status === null) return null;

  const nameOf = (n: number) => layerName(state.layerMetadata, n);
  const predicatesSupported =
    ((bundle.lightingCaps?.features ?? 0) & RUNTIME_EFFECTS_CONDITIONS) !== 0;
  const exactKeys = glove80ConnectionKeys(layer).map((preset) => ({
    preset,
    key: keyAt(bundle.model.keys, preset.row, preset.col),
  }));
  const glove80Available =
    bundle.model.name.toLowerCase().includes("glove80") &&
    numLayers > 2 &&
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
    const rules = installGlove80StatusRules(state.runtimeConditionalDraft, layer);
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
      layer,
    );
    setMessage(
      result.ok
        ? `Installed and verified battery bars, three Bluetooth profile keys, and the USB status key on ${nameOf(layer)}.`
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
        ? `Bound and verified Bluetooth slot ${slot + 1} with status lighting on ${nameOf(layer)}.`
        : `Bound and verified USB output with status lighting on ${nameOf(layer)}.`,
    );
  };

  const installBatteryBar = async () => {
    if (!selectedBar) return;
    const rules = replaceBatteryBar(state.runtimeConditionalDraft, {
      layer,
      node,
      leds: selectedBar,
    });
    if (
      await applyRules(
        rules,
        `Installed and verified a five-segment battery bar for node ${node} on ${nameOf(layer)}.`,
      )
    ) {
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

      <label className="mt-2 block text-[11px] text-faint">
        Status layer
        <select
          value={layer}
          onChange={(event) => setLayer(Number(event.target.value))}
          className={selectClass}
        >
          {Array.from({ length: numLayers }, (_, index) => (
            <option key={index} value={index}>
              {nameOf(index)}
              {index === magicLayer ? " · wakes lighting" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
        Every rule installed below lights only while this layer is active.
      </p>

      {glove80Available && predicatesSupported && (
        <div className="mt-2 rounded-lg border border-accent-deep/40 bg-accent-dim/15 p-3">
          <div className="text-[12.5px] font-medium text-ink">Glove80 Magic status cluster</div>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            On {nameOf(layer)}: two five-key battery bars, Bluetooth slots 1–3 on the lower left
            thumb arc, and USB on the upper thumb key. Green is active, blue selected/idle,
            blinking white advertising, red bonded-idle, and gray empty.
          </p>
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={state.lightingBusy}
            onClick={installGlove80}
          >
            Install complete Glove80 setup on {nameOf(layer)}
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
              className={selectClass}
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
                className={selectClass}
              >
                {Array.from({ length: bundle.caps.num_ble_profiles }, (_, index) => (
                  <option key={index} value={index}>Slot {index + 1}</option>
                ))}
              </select>
            </label>
          ) : <div />}
        </div>
        <Button
          variant="outline"
          className="mt-2 w-full"
          title={selectedKey ? keyHoverTitle(selectedKey) : undefined}
          disabled={!predicatesSupported || selectedKey === null || state.lightingBusy}
          onClick={installConnectionKey}
        >
          {selectedKey ? `Configure ${keyAddressLabel(selectedKey)}` : "Select one key"}
        </Button>
      </div>

      <div className="mt-2 rounded-lg border border-line-soft bg-well p-3">
        <div className="text-[12.5px] font-medium text-ink">Five-segment battery bar</div>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Select five keys in a column or a row. Along the fill direction they become 20%, 40%,
          60%, 80%, and 100%; low levels turn amber/red and charging turns blue.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-faint">
            Battery node
            <select
              value={node}
              onChange={(event) => setNode(Number(event.target.value))}
              className={selectClass}
            >
              {Array.from({ length: 1 + bundle.caps.num_split_peripherals }, (_, index) => (
                <option key={index} value={index}>{index === 0 ? "Central · 0" : `Peripheral · ${index}`}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-faint">
            Fill direction
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as BarOrder | "auto")}
              className={selectClass}
            >
              <option value="auto">
                Auto{selectedKeys.length > 0
                  ? ` · ${BAR_ORDERS.find((entry) => entry.id === barOrder)?.label.toLowerCase()}`
                  : ""}
              </option>
              {BAR_ORDERS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
        </div>
        {barPreview && (
          <p className="mt-2 text-[11px] leading-relaxed text-mute">
            20% → 100%:{" "}
            {barPreview.map((key, index) => (
              <span key={key.ledId} title={keyHoverTitle(key)}>
                {index > 0 && " · "}
                {keyAddressLabel(key)}
              </span>
            ))}
          </p>
        )}
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
