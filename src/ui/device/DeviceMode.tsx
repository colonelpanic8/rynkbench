// Device mode: identity, capabilities, status, BLE, matrix tester — and the
// danger zone. Each card is its own file; this one is the page.

import { KeyboardCanvas } from "../KeyboardCanvas";
import { useWorkbench } from "../state";
import { Chip, Panel, Row, SectionLabel } from "../kit";
import { BatteryGlyph } from "../icons";
import { KIND_LABEL } from "../session-labels";
import { LockIndicators } from "../live/LockIndicators";
import { BleCard } from "./BleCard";
import { BuildCard } from "./BuildCard";
import { DangerZone } from "./DangerZone";
import { DiagnosticsCard } from "./DiagnosticsCard";
import { MatrixTester } from "./MatrixTester";
import { SplitLatencyCard } from "./SplitLatencyCard";

const CONNECTION_LABEL: Record<string, string> = {
  Usb: "USB",
  Ble: "BLE",
};

function hex4(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

export function DeviceMode() {
  const { bundle, state } = useWorkbench();
  const { info, caps, protocol, build, lightingCaps } = bundle;
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

          <BuildCard build={build} />

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
            <div className="flex items-center justify-between">
              <SectionLabel>Connection</SectionLabel>
              <LockIndicators />
            </div>
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

        {caps.ble_enabled && caps.num_ble_profiles > 0 && <BleCard />}

        {caps.is_split && caps.ble_enabled && <SplitLatencyCard />}

        <MatrixTester />

        <DiagnosticsCard />

        <DangerZone />
      </div>
    </div>
  );
}
