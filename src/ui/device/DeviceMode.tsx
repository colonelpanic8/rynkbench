// Device mode: identity, capabilities, status — and the danger zone.

import { useState } from "react";
import { KeyboardCanvas } from "../KeyboardCanvas";
import { useWorkbench, errorMessage } from "../state";
import { Button, Chip, Panel, Row, SectionLabel } from "../kit";
import { BatteryGlyph, WarningIcon } from "../icons";
import { KIND_LABEL } from "../TopBar";

const CONNECTION_LABEL: Record<string, string> = {
  Usb: "USB",
  Ble: "BLE",
};

function hex4(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

function DangerZone() {
  const { io } = useWorkbench();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fire = async () => {
    setBusy(true);
    setError(null);
    try {
      await io.rebootToBootloader();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setArming(false);
    }
  };

  return (
    <Panel className="border-danger/30 p-4">
      <div className="flex items-center gap-2 text-danger">
        <WarningIcon size={15} />
        <span className="text-[13px] font-semibold">Danger zone</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
        Reboot the keyboard into its bootloader for firmware flashing. The device will
        disconnect and stop typing until it is flashed or power-cycled.
      </p>
      {done ? (
        <div className="mt-3 text-[12.5px] text-warn">
          Bootloader jump requested — the device should now be in flashing mode.
        </div>
      ) : arming ? (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="danger" disabled={busy} onClick={fire}>
            {busy ? "Rebooting…" : "Confirm reboot"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setArming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="danger" className="mt-3" onClick={() => setArming(true)}>
          Reboot to bootloader…
        </Button>
      )}
      {error && <div className="mt-2 text-[12px] text-danger">Failed: {error}</div>}
    </Panel>
  );
}

export function DeviceMode() {
  const { bundle, state } = useWorkbench();
  const { info, caps, protocol, lightingCaps } = bundle;
  const battery = state.battery !== "Unavailable" ? state.battery.Available : null;
  const conn = state.connection;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-8">
        {/* the board as identity */}
        <div className="canvas-well rounded-2xl border border-line-soft px-8 py-5">
          <KeyboardCanvas
            model={bundle.model}
            interactive={false}
            className="mx-auto max-h-56 w-full"
            decorFor={(key) => ({
              glyph: key.label ? { text: key.label, dim: true } : undefined,
            })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel className="p-4">
            <SectionLabel>Identity</SectionLabel>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Product">{info.product_name}</Row>
              <Row label="Manufacturer">{info.manufacturer}</Row>
              <Row label="Serial" mono>
                {info.serial_number || "—"}
              </Row>
              <Row label="Vendor / product id" mono>
                {hex4(info.vendor_id)} · {hex4(info.product_id)}
              </Row>
              <Row label="RMK firmware" mono>
                v{info.rmk_version.major}.{info.rmk_version.minor}.{info.rmk_version.patch}
              </Row>
              <Row label="Rynk protocol" mono>
                v{protocol.major}.{protocol.minor}
              </Row>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Capabilities</SectionLabel>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Matrix">
                {caps.num_rows} × {caps.num_cols}
              </Row>
              <Row label="Layers">{caps.num_layers}</Row>
              <Row label="Encoders">{caps.num_encoders}</Row>
              <Row label="Combos">{caps.max_combos}</Row>
              <Row label="Macro space">{caps.macro_space_size} B</Row>
              <Row label="LEDs">
                {lightingCaps ? lightingCaps.led_count : "—"}
              </Row>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {caps.storage_enabled && <Chip>storage</Chip>}
              {caps.lighting_enabled && <Chip>lighting</Chip>}
              {caps.is_split && <Chip>split · {caps.num_split_peripherals}p</Chip>}
              {caps.ble_enabled && <Chip>BLE · {caps.num_ble_profiles} profiles</Chip>}
              {caps.bulk_transfer_supported && <Chip>bulk transfer</Chip>}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Battery</SectionLabel>
            {battery ? (
              <div className="mt-3 flex items-center gap-4">
                <BatteryGlyph
                  level={battery.level ?? null}
                  charging={battery.charge_state === "Charging"}
                  size={34}
                />
                <div>
                  <div className="tnum text-[20px] font-semibold text-ink">
                    {battery.level != null ? `${battery.level}%` : "—"}
                  </div>
                  <div className="text-[12px] text-mute">
                    {battery.charge_state}
                    {caps.is_split ? " · central half" : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[12.5px] text-faint">
                Battery status is unavailable on this connection — likely a wired device.
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Connection</SectionLabel>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Session">{bundle.session.label}</Row>
              <Row label="Transport">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</Row>
              {conn ? (
                <>
                  <Row label="USB">{conn.usb}</Row>
                  <Row label="BLE">
                    {conn.ble.state} · profile {conn.ble.profile}
                  </Row>
                  <Row label="Preferred">{CONNECTION_LABEL[conn.preferred] ?? conn.preferred}</Row>
                </>
              ) : (
                <Row label="Status">unknown</Row>
              )}
            </div>
          </Panel>
        </div>

        <DangerZone />
      </div>
    </div>
  );
}
