// Workbench top bar: identity, live status, disconnect.

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { parseMoergoJson, serializeMoergoJson } from "../config/moergo";
import type { MoergoImport } from "../config/moergo";
import type { BatteryStatus, KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "./state";
import { Chip, Button } from "./kit";
import { BatteryGlyph, PowerIcon, Wordmark } from "./icons";

export const KIND_LABEL: Record<string, string> = {
  mock: "Mock",
  webhid: "USB · HID",
  webserial: "USB · Serial",
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
  const { bundle, state, dispatch, io } = useWorkbench();
  const fileInput = useRef<HTMLInputElement>(null);
  const imported = useRef<Pick<MoergoImport, "layerNames" | "template"> | null>(null);
  const [transfer, setTransfer] = useState<"importing" | "exporting" | null>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const split = bundle.caps.is_split;
  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setTransfer("importing");
    setFileNotice(null);
    try {
      const parsed = parseMoergoJson(
        await file.text(),
        bundle.caps.num_rows,
        bundle.caps.num_cols,
      );
      if (parsed.layers.length > bundle.caps.num_layers) {
        throw new Error(
          `Layout has ${parsed.layers.length} layers; this keyboard supports ${bundle.caps.num_layers}`,
        );
      }
      let changed = 0;
      for (let layer = 0; layer < parsed.layers.length; layer += 1) {
        for (let offset = 0; offset < parsed.layers[layer].length; offset += 1) {
          const action = parsed.layers[layer][offset];
          const previous = state.layers[layer][offset];
          if (JSON.stringify(action) === JSON.stringify(previous)) continue;
          const row = Math.floor(offset / bundle.caps.num_cols);
          const col = offset % bundle.caps.num_cols;
          dispatch({ type: "keyWriteStart", layer, row, col, action });
          try {
            await bundle.session.keymap.setKey(layer, row, col, action);
            dispatch({ type: "keyWriteOk", layer, row, col });
            changed += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dispatch({
              type: "keyWriteErr",
              layer,
              row,
              col,
              prev: previous,
              attempted: action,
              message,
            });
            throw new Error(`Writing layer ${layer} r${row},c${col}: ${message}`);
          }
        }
      }
      imported.current = { layerNames: parsed.layerNames, template: parsed.template };
      setFileNotice(
        changed === 0 ? `${file.name} already matches the keyboard` : `Imported ${changed} key${changed === 1 ? "" : "s"} from ${file.name}`,
      );
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setTransfer(null);
    }
  };

  const exportJson = () => {
    setTransfer("exporting");
    setFileNotice(null);
    try {
      let layerCount = state.layers.length;
      while (
        layerCount > 1 &&
        state.layers[layerCount - 1].every(
          (action: KeyAction) => action === "No" || action === "Transparent",
        )
      ) {
        layerCount -= 1;
      }
      const text = serializeMoergoJson(state.layers.slice(0, layerCount), {
        layerNames: imported.current?.layerNames,
        template: imported.current?.template,
      });
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bundle.model.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "glove80"}-rynkbench.json`;
      link.click();
      URL.revokeObjectURL(url);
      setFileNotice(`Exported ${layerCount} layer${layerCount === 1 ? "" : "s"}`);
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
        accept=".json,application/json"
        className="hidden"
        onChange={importJson}
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
        title="Import a MoErgo Layout Editor JSON backup and write changed keys to the keyboard"
      >
        {transfer === "importing" ? "Importing…" : "Import JSON"}
      </Button>
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={exportJson}
        title="Export the live keymap as a MoErgo Layout Editor JSON backup"
      >
        {transfer === "exporting" ? "Exporting…" : "Export JSON"}
      </Button>

      <div className="h-6 w-px bg-line-soft" />

      <Button variant="ghost" onClick={io.disconnect} title="Disconnect">
        <PowerIcon size={15} />
        Disconnect
      </Button>
    </header>
  );
}
