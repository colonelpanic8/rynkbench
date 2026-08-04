// Workbench top bar: identity, live status, disconnect.

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  initConfigWasm,
  loadCatalog,
} from "../config/document";
import type { ConfigFormat, ExtensionCatalog } from "../config/document";
import { exportDocument, importDocument } from "../config/transfer";
import type { BatteryStatus } from "../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "./state";
import { Chip, Button } from "./kit";
import { BatteryGlyph, PowerIcon, Wordmark } from "./icons";

export const KIND_LABEL: Record<string, string> = {
  mock: "Mock",
  webhid: "USB · HID",
  webserial: "USB · Serial",
  webbluetooth: "Bluetooth",
  native: "Native",
  nativeble: "Bluetooth · Native",
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
  const { bundle, state, dispatch, io } = useWorkbench();
  const fileInput = useRef<HTMLInputElement>(null);
  /** The last document imported, kept verbatim. An export reuses it for the
   *  layer labels the firmware does not store, and — for MoErgo output — as the
   *  template carrying the editor-owned sections Rynk never sees. */
  const imported = useRef<string | null>(null);
  const [transfer, setTransfer] = useState<"importing" | "exporting" | null>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const split = bundle.caps.is_split;
  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  const catalog = async (): Promise<ExtensionCatalog> => {
    await initConfigWasm();
    return loadCatalog(
      bundle.session,
      state,
      bundle.extensionEffectNames,
      bundle.extensionPaletteNames,
    );
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setTransfer("importing");
    setFileNotice(null);
    try {
      const text = await file.text();
      const result = await importDocument({
        text,
        session: bundle.session,
        bundle,
        state,
        dispatch,
        catalog: await catalog(),
      });
      imported.current = text;
      const parts = [
        result.changedKeys > 0
          ? `${result.changedKeys} key${result.changedKeys === 1 ? "" : "s"}`
          : null,
        ...result.applied,
      ].filter((part) => part !== null);
      const summary =
        parts.length === 0
          ? `${file.name} already matches the keyboard`
          : `Imported ${parts.join(", ")} from ${file.name}`;
      setFileNotice(
        result.skipped.length === 0 ? summary : `${summary} — not applied: ${result.skipped.join(", ")}`,
      );
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setTransfer(null);
    }
  };

  const exportFile = async (format: ConfigFormat) => {
    setTransfer("exporting");
    setFileNotice(null);
    try {
      const text = exportDocument(
        state,
        await catalog(),
        format,
        imported.current ?? undefined,
      );
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      const stem =
        bundle.model.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ||
        "glove80";
      link.download = `${stem}-rynkbench.${FORMAT_EXTENSION[format]}`;
      link.click();
      URL.revokeObjectURL(url);
      setFileNotice(`Exported ${FORMAT_LABEL[format]}`);
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setTransfer(null);
    }
  };

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

      <input
        ref={fileInput}
        type="file"
        accept=".toml,.json,application/json,application/toml"
        className="hidden"
        onChange={importFile}
      />
      {fileNotice && (
        <span className="max-w-64 truncate text-[11px] text-mute" title={fileNotice}>
          {fileNotice}
        </span>
      )}
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={() => fileInput.current?.click()}
        title="Import a glove80.toml or a MoErgo Layout Editor JSON backup, writing only what differs from the keyboard"
      >
        {transfer === "importing" ? "Importing…" : "Import"}
      </Button>
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={() => void exportFile("toml")}
        title="Export the live configuration as a glove80.toml — keymap and lighting"
      >
        {transfer === "exporting" ? "Exporting…" : "Export TOML"}
      </Button>
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={() => void exportFile("moergo-json")}
        title="Export the live keymap as a MoErgo Layout Editor JSON backup"
      >
        Export JSON
      </Button>

      <div className="h-6 w-px bg-line-soft" />

      <Button variant="ghost" onClick={io.disconnect} title="Disconnect">
        <PowerIcon size={15} />
        Disconnect
      </Button>
    </header>
  );
}
