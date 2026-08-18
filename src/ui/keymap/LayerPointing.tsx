import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CaretConfig,
  CursorConfig,
  HidKeyCode,
  PointingConfig,
  PointingMode,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { Button, SectionLabel, TextInput, cx } from "../kit";
import { NumberField } from "../lighting/EffectEditor";
import {
  ChevronRightIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  WarningIcon,
} from "../icons";
import {
  POINTING_DEVICE_CAPACITY,
  POINTING_MODE_KEYPAD,
  POINTING_OVERRIDE_CAPACITY,
  activePointingDevices,
  activePointingOverrides,
  addPointingDevice,
  defaultPointingMode,
  pointingConfigsEqual,
  pointingModeKind,
  removePointingDevice,
  removePointingOverride,
  setPointingOverride,
  updatePointingDeviceMode,
  type PointingModeKind,
} from "../pointing";
import { useWorkbench } from "../state";
import { KeycodeBrowser } from "./ActionEditor";

const BASE_MODE_KINDS: PointingModeKind[] = ["Cursor", "Scroll", "Sniper", "Caret", "Drag", "Press"];

function bounded(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px] text-mute">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function CursorFields({ value, onChange }: { value: CursorConfig; onChange: (value: CursorConfig) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <NumberField
        label="X multiplier"
        min={0}
        max={255}
        value={value.multiplier_x}
        onChange={(multiplier_x) => onChange({ ...value, multiplier_x: bounded(multiplier_x, 0, 255) })}
      />
      <NumberField
        label="Y multiplier"
        min={0}
        max={255}
        value={value.multiplier_y}
        onChange={(multiplier_y) => onChange({ ...value, multiplier_y: bounded(multiplier_y, 0, 255) })}
      />
      <Toggle label="Invert X" value={value.invert_x} onChange={(invert_x) => onChange({ ...value, invert_x })} />
      <Toggle label="Invert Y" value={value.invert_y} onChange={(invert_y) => onChange({ ...value, invert_y })} />
    </div>
  );
}

function ButtonMask({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-mute">{label}</div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 8 }, (_, index) => {
          const bit = 1 << index;
          const active = (value & bit) !== 0;
          return (
            <button
              key={bit}
              type="button"
              onClick={() => onChange(active ? value & ~bit : value | bit)}
              className={cx(
                "cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                active
                  ? "border-accent bg-accent-dim/40 text-accent"
                  : "border-line text-faint hover:border-line-strong hover:text-mute",
              )}
            >
              M{index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PointingKey = "keycode_up" | "keycode_down" | "keycode_left" | "keycode_right" | "keycode_tap";

function CaretKeyField({ label, value, onChange }: { label: string; value: HidKeyCode; onChange: (value: HidKeyCode) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between rounded-md border border-line bg-well px-2 py-1 text-[11.5px] text-mute hover:border-line-strong"
      >
        <span>{label}</span>
        <span className="font-mono text-ink">{value}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-line-soft bg-well p-2">
          <KeycodeBrowser
            query={query}
            onQuery={setQuery}
            modifierPicks={false}
            compact
            onPick={(code) => {
              onChange(code);
              setOpen(false);
              setQuery("");
            }}
          />
        </div>
      )}
    </div>
  );
}

function CaretFields({ value, onChange }: { value: CaretConfig; onChange: (value: CaretConfig) => void }) {
  const keyFields: Array<{ field: Exclude<PointingKey, "keycode_tap">; label: string }> = [
    { field: "keycode_up", label: "Up motion" },
    { field: "keycode_down", label: "Down motion" },
    { field: "keycode_left", label: "Left motion" },
    { field: "keycode_right", label: "Right motion" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <NumberField
        label="Threshold"
        min={-32768}
        max={32767}
        value={value.threshold}
        onChange={(threshold) => onChange({ ...value, threshold: bounded(threshold, -32768, 32767) })}
      />
      <Toggle label="Disable X" value={value.disable_x} onChange={(disable_x) => onChange({ ...value, disable_x })} />
      <Toggle label="Disable Y" value={value.disable_y} onChange={(disable_y) => onChange({ ...value, disable_y })} />
      <Toggle label="Invert X" value={value.invert_x} onChange={(invert_x) => onChange({ ...value, invert_x })} />
      <Toggle label="Invert Y" value={value.invert_y} onChange={(invert_y) => onChange({ ...value, invert_y })} />
      <div className="mt-1 flex flex-col gap-1">
        {keyFields.map(({ field, label }) => (
          <CaretKeyField
            key={field}
            label={label}
            value={value[field]}
            onChange={(keycode) => onChange({ ...value, [field]: keycode })}
          />
        ))}
      </div>
    </div>
  );
}

function PointingModeEditor({ value, allowKeypad, onChange }: { value: PointingMode; allowKeypad: boolean; onChange: (value: PointingMode) => void }) {
  const kind = pointingModeKind(value);
  const modeKinds = allowKeypad ? [...BASE_MODE_KINDS, "Keypad" as const] : BASE_MODE_KINDS;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line-soft bg-well p-0.5">
        {modeKinds.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => onChange(defaultPointingMode(candidate))}
            className={cx(
              "cursor-pointer rounded-md px-1 py-1 text-[10.5px] font-medium",
              candidate === kind ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
            )}
          >
            {candidate}
          </button>
        ))}
      </div>

      {"Cursor" in value && <CursorFields value={value.Cursor} onChange={(Cursor) => onChange({ Cursor })} />}
      {"Scroll" in value && (
        <div className="flex flex-col gap-1.5">
          <NumberField label="X multiplier" min={0} max={255} value={value.Scroll.multiplier_x} onChange={(multiplier_x) => onChange({ Scroll: { ...value.Scroll, multiplier_x: bounded(multiplier_x, 0, 255) } })} />
          <NumberField label="X divisor" min={0} max={255} value={value.Scroll.divisor_x} onChange={(divisor_x) => onChange({ Scroll: { ...value.Scroll, divisor_x: bounded(divisor_x, 0, 255) } })} />
          <NumberField label="Y multiplier" min={0} max={255} value={value.Scroll.multiplier_y} onChange={(multiplier_y) => onChange({ Scroll: { ...value.Scroll, multiplier_y: bounded(multiplier_y, 0, 255) } })} />
          <NumberField label="Y divisor" min={0} max={255} value={value.Scroll.divisor_y} onChange={(divisor_y) => onChange({ Scroll: { ...value.Scroll, divisor_y: bounded(divisor_y, 0, 255) } })} />
          <Toggle label="Invert X" value={value.Scroll.invert_x} onChange={(invert_x) => onChange({ Scroll: { ...value.Scroll, invert_x } })} />
          <Toggle label="Invert Y" value={value.Scroll.invert_y} onChange={(invert_y) => onChange({ Scroll: { ...value.Scroll, invert_y } })} />
        </div>
      )}
      {"Sniper" in value && (
        <div className="flex flex-col gap-1.5">
          <NumberField label="Multiplier" min={0} max={255} value={value.Sniper.multiplier} onChange={(multiplier) => onChange({ Sniper: { ...value.Sniper, multiplier: bounded(multiplier, 0, 255) } })} />
          <NumberField label="Divisor" min={0} max={255} value={value.Sniper.divisor} onChange={(divisor) => onChange({ Sniper: { ...value.Sniper, divisor: bounded(divisor, 0, 255) } })} />
          <Toggle label="Invert X" value={value.Sniper.invert_x} onChange={(invert_x) => onChange({ Sniper: { ...value.Sniper, invert_x } })} />
          <Toggle label="Invert Y" value={value.Sniper.invert_y} onChange={(invert_y) => onChange({ Sniper: { ...value.Sniper, invert_y } })} />
        </div>
      )}
      {"Caret" in value && <CaretFields value={value.Caret} onChange={(Caret) => onChange({ Caret })} />}
      {"Drag" in value && (
        <div className="flex flex-col gap-2.5">
          <CursorFields value={value.Drag.cursor} onChange={(cursor) => onChange({ Drag: { ...value.Drag, cursor } })} />
          <ButtonMask label="Gesture button" value={value.Drag.toggled_by} onChange={(toggled_by) => onChange({ Drag: { ...value.Drag, toggled_by } })} />
          <ButtonMask label="Latched buttons" value={value.Drag.latches} onChange={(latches) => onChange({ Drag: { ...value.Drag, latches } })} />
        </div>
      )}
      {"Press" in value && (
        <div className="flex flex-col gap-2.5">
          <CursorFields value={value.Press.cursor} onChange={(cursor) => onChange({ Press: { ...value.Press, cursor } })} />
          <ButtonMask label="Held while touched" value={value.Press.holds} onChange={(holds) => onChange({ Press: { ...value.Press, holds } })} />
        </div>
      )}
      {"Keypad" in value && (
        <div className="flex flex-col gap-1.5">
          <NumberField label="X threshold" min={1} max={32767} value={value.Keypad.threshold_x} onChange={(threshold_x) => onChange({ Keypad: { ...value.Keypad, threshold_x: bounded(threshold_x, 1, 32767) } })} />
          <NumberField label="Y threshold" min={1} max={32767} value={value.Keypad.threshold_y} onChange={(threshold_y) => onChange({ Keypad: { ...value.Keypad, threshold_y: bounded(threshold_y, 1, 32767) } })} />
          <Toggle label="Disable X" value={value.Keypad.disable_x} onChange={(disable_x) => onChange({ Keypad: { ...value.Keypad, disable_x } })} />
          <Toggle label="Disable Y" value={value.Keypad.disable_y} onChange={(disable_y) => onChange({ Keypad: { ...value.Keypad, disable_y } })} />
          <Toggle label="Invert X" value={value.Keypad.invert_x} onChange={(invert_x) => onChange({ Keypad: { ...value.Keypad, invert_x } })} />
          <Toggle label="Invert Y" value={value.Keypad.invert_y} onChange={(invert_y) => onChange({ Keypad: { ...value.Keypad, invert_y } })} />
          <div className="mt-1 flex flex-col gap-1">
            {([
              ["keycode_up", "Up motion"],
              ["keycode_down", "Down motion"],
              ["keycode_left", "Left motion"],
              ["keycode_right", "Right motion"],
              ["keycode_tap", "Primary tap"],
            ] as Array<[PointingKey, string]>).map(([field, label]) => (
              <CaretKeyField key={field} label={label} value={value.Keypad[field]} onChange={(keycode) => onChange({ Keypad: { ...value.Keypad, [field]: keycode } })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LayerPointing({ selectedDeviceId }: { selectedDeviceId?: number }) {
  const { bundle, state, dispatch, io } = useWorkbench();
  const [open, setOpen] = useState(selectedDeviceId !== undefined);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const [newDeviceId, setNewDeviceId] = useState("0");
  const [overrideDeviceId, setOverrideDeviceId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const draft = state.pointingDraft;
  const applied = state.pointingConfig;

  const devices = useMemo(() => (draft ? activePointingDevices(draft) : []), [draft]);
  const allOverrides = useMemo(() => (draft ? activePointingOverrides(draft) : []), [draft]);
  const overrides = useMemo(
    () => allOverrides.filter((entry) => entry.layer === state.uiLayer),
    [allOverrides, state.uiLayer],
  );
  const availableDevices = devices.filter(
    (device) => !overrides.some((entry) => entry.device_id === device.device_id),
  );
  const selectedHasOverride =
    selectedDeviceId !== undefined &&
    overrides.some((entry) => entry.device_id === selectedDeviceId);
  const deviceLabel = (deviceId: number) =>
    bundle.model.pointingDevices.find((device) => device.id === deviceId)?.label ??
    `Device ${deviceId}`;

  useEffect(() => {
    if (selectedDeviceId === undefined) return;
    if (!open) {
      setOpen(true);
      return;
    }
    const frame = requestAnimationFrame(() =>
      selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, selectedDeviceId, state.uiLayer]);

  useEffect(() => {
    if (!availableDevices.some((device) => String(device.device_id) === overrideDeviceId)) {
      setOverrideDeviceId(availableDevices[0] ? String(availableDevices[0].device_id) : "");
    }
  }, [availableDevices, overrideDeviceId]);

  if (!draft || !applied) return null;

  const staged = !pointingConfigsEqual(applied, draft);
  const keypadSupported =
    ((bundle.pointingCapabilities?.mode_flags ?? 0) & POINTING_MODE_KEYPAD) !== 0 ||
    devices.some((device) => pointingModeKind(device.mode) === "Keypad") ||
    allOverrides.some((entry) => pointingModeKind(entry.mode) === "Keypad");
  const layerName = state.layerMetadata?.[state.uiLayer]?.name ?? `Layer ${state.uiLayer}`;
  const edit = (change: () => PointingConfig): boolean => {
    try {
      dispatch({ type: "pointingDraftSet", config: change() });
      setLocalError(null);
      return true;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const addDevice = () => {
    const id = Number(newDeviceId);
    if (edit(() => addPointingDevice(draft, id))) {
      const used = new Set([...devices.map((device) => device.device_id), id]);
      setNewDeviceId(String(Array.from({ length: 256 }, (_, candidate) => candidate).find((candidate) => !used.has(candidate)) ?? 0));
    }
  };

  return (
    <div className="border-t border-line-soft pt-4">
      <button type="button" className="flex w-full cursor-pointer items-center justify-between" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          <ChevronRightIcon size={11} className={cx("text-faint transition-transform duration-120", open && "rotate-90")} />
          <SectionLabel>Pointing</SectionLabel>
          {staged && <span className="text-[11px] text-accent">staged</span>}
        </span>
        <span className="tnum text-[11px] text-faint">{draft.override_count}/{POINTING_OVERRIDE_CAPACITY} overrides</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-[11.5px] leading-relaxed text-faint">
            Base modes apply everywhere. {layerName} overrides replace them while this layer is on top.
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Device defaults</SectionLabel>
              <span className="text-[10.5px] text-faint">{devices.length}/{POINTING_DEVICE_CAPACITY}</span>
            </div>
            <div className="flex flex-col gap-2">
              {devices.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11.5px] text-faint">No pointing devices configured.</div>}
              {devices.map((device) => (
                <div
                  key={device.device_id}
                  ref={selectedDeviceId === device.device_id && !selectedHasOverride ? selectedCardRef : undefined}
                  className={cx(
                    "rounded-lg border bg-raised p-2.5",
                    selectedDeviceId === device.device_id && !selectedHasOverride
                      ? "border-accent"
                      : "border-line",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ink">{deviceLabel(device.device_id)}</span>
                    <button
                      type="button"
                      title={`Remove device ${device.device_id} and all of its overrides`}
                      className="cursor-pointer text-faint hover:text-danger"
                      onClick={() => {
                        if (window.confirm(`Remove pointing device ${device.device_id} and all of its layer overrides?`)) {
                          edit(() => removePointingDevice(draft, device.device_id));
                        }
                      }}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <PointingModeEditor value={device.mode} allowKeypad={keypadSupported} onChange={(mode) => edit(() => updatePointingDeviceMode(draft, device.device_id, mode))} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <TextInput aria-label="New pointing device ID" type="number" min={0} max={255} value={newDeviceId} onChange={(event) => setNewDeviceId(event.target.value)} className="w-24 py-1" />
              <Button variant="outline" className="flex-1 py-1" disabled={devices.length >= POINTING_DEVICE_CAPACITY} onClick={addDevice}>
                <PlusIcon size={11} /> Add device
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>{layerName} overrides</SectionLabel>
              <span className="text-[10.5px] text-faint">{overrides.length} on layer</span>
            </div>
            <div className="flex flex-col gap-2">
              {overrides.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11.5px] text-faint">This layer uses every device's base mode.</div>}
              {overrides.map((entry) => (
                <div
                  key={entry.device_id}
                  ref={selectedDeviceId === entry.device_id ? selectedCardRef : undefined}
                  className={cx(
                    "rounded-lg border bg-accent-dim/10 p-2.5",
                    selectedDeviceId === entry.device_id
                      ? "border-accent"
                      : "border-accent-deep/30",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ink">{deviceLabel(entry.device_id)}</span>
                    <button type="button" title="Remove this layer override" className="cursor-pointer text-faint hover:text-danger" onClick={() => edit(() => removePointingOverride(draft, state.uiLayer, entry.device_id))}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <PointingModeEditor value={entry.mode} allowKeypad={keypadSupported} onChange={(mode) => edit(() => setPointingOverride(draft, state.uiLayer, entry.device_id, mode))} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                aria-label="Pointing device for new layer override"
                value={overrideDeviceId}
                onChange={(event) => setOverrideDeviceId(event.target.value)}
                disabled={availableDevices.length === 0}
                className="min-w-0 flex-1 rounded-lg border border-line bg-well px-2 py-1.5 text-[12px] text-ink disabled:opacity-40"
              >
                {availableDevices.map((device) => <option key={device.device_id} value={device.device_id}>{deviceLabel(device.device_id)} · {pointingModeKind(device.mode)}</option>)}
              </select>
              <Button variant="outline" className="py-1" disabled={overrideDeviceId === "" || draft.override_count >= POINTING_OVERRIDE_CAPACITY} onClick={() => edit(() => setPointingOverride(draft, state.uiLayer, Number(overrideDeviceId)))}>
                <PlusIcon size={11} /> Override
              </Button>
            </div>
          </div>

          {(localError || state.pointingError) && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-dim/20 px-2.5 py-2 text-[11.5px] text-danger">
              <WarningIcon size={13} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{localError ?? state.pointingError}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" className="flex-1" disabled={!staged || state.pointingBusy} onClick={() => void io.applyPointingConfig()}>
              {state.pointingBusy && <SpinnerIcon size={13} />} Apply
            </Button>
            <Button variant="ghost" disabled={!staged || state.pointingBusy} onClick={() => dispatch({ type: "pointingDraftReset" })}>Discard</Button>
          </div>
          {state.pointingError && (
            <Button variant="ghost" disabled={state.pointingBusy} onClick={() => void io.reloadPointingConfig()}>Reload from keyboard</Button>
          )}
        </div>
      )}
    </div>
  );
}
