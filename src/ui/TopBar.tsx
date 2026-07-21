// Workbench top bar: identity, live status, disconnect.

import type { BatteryStatus } from "../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "./state";
import { Chip, Button } from "./kit";
import { BatteryGlyph, PowerIcon, Wordmark } from "./icons";

export const KIND_LABEL: Record<string, string> = {
  mock: "Mock",
  webhid: "USB · HID",
  webbluetooth: "Bluetooth",
  native: "Native",
};

function BatteryReadout({ battery, split }: { battery: BatteryStatus; split: boolean }) {
  const available = battery !== "Unavailable" ? battery.Available : null;
  const level = available?.level ?? null;
  const charging = available?.charge_state === "Charging";
  return (
    <div
      className="flex items-center gap-2"
      title={
        available
          ? `${split ? "Central half · " : ""}${available.charge_state}${level != null ? ` · ${level}%` : ""}`
          : "Battery status unavailable"
      }
    >
      <BatteryGlyph level={level} charging={charging} />
      <span className="tnum text-[12.5px] text-mute">
        {level != null ? `${level}%` : available ? "—" : "n/a"}
      </span>
    </div>
  );
}

export function TopBar() {
  const { bundle, state, io } = useWorkbench();
  const split = bundle.caps.is_split;
  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line-soft bg-panel px-4">
      <div className="flex items-center gap-3">
        <Wordmark size={26} />
        <div className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-semibold text-ink">{bundle.model.name}</span>
          <span className="text-[10.5px] text-faint">Rynkbench</span>
        </div>
        <Chip tone="neutral">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</Chip>
      </div>

      <div className="flex-1" />

      <div
        key={activeLabel}
        className="animate-pop"
        title={`Active layers: ${activeLabel}. Default layer: ${state.defaultLayer}.`}
      >
        <Chip tone="accent" className="tnum">
          <span className="size-1.5 rounded-full bg-accent" />
          {activeLabel}
        </Chip>
      </div>

      <BatteryReadout battery={state.battery} split={split} />

      <div className="h-6 w-px bg-line-soft" />

      <Button variant="ghost" onClick={io.disconnect} title="Disconnect">
        <PowerIcon size={15} />
        Disconnect
      </Button>
    </header>
  );
}
