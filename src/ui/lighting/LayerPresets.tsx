// Per-layer lighting. Two modes, decided by firmware support:
//
// - On-device scenes (LAYER_SCENES firmware): the layer→effect table lives on
//   the keyboard, composited natively as layers activate, and survives
//   disconnect and reboot. Each layer is painted WYSIWYG from its own canvas
//   tab (see LightingMode); this panel keeps only the device-wide policy,
//   capacity readout, and the one-time local-preset migration.
// - Local presets (older firmware): Rynkbench stores named overlay snapshots
//   per layer (localStorage, keyed by device serial) and, when "follow" is on,
//   pushes the matching preset via replaceOverlay whenever the live layer
//   changes. Honest by design: this only works while Rynkbench is connected.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LightingLayerPolicy,
  LightingOverlayCell,
  LightingSceneStatus,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "../state";
import { Button, SectionLabel, TextInput, cx } from "../kit";
import { TrashIcon } from "../icons";

interface LayerPreset {
  name: string;
  cells: LightingOverlayCell[];
}

type PresetMap = Record<number, LayerPreset>;

interface Stored {
  presets: PresetMap;
  follow: boolean;
}

function storageKey(serial: string): string {
  return `rynkbench:layer-lighting:${serial || "unknown"}`;
}

function load(serial: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(serial));
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // fall through to defaults
  }
  return { presets: {}, follow: false };
}

export function LayerPresets() {
  const { bundle } = useWorkbench();
  return bundle.sceneStatus ? <DeviceScenes status={bundle.sceneStatus} /> : <LocalPresets />;
}

function LayerChips({
  numLayers,
  sel,
  onSel,
  hasContent,
  live,
  titleFor,
}: {
  numLayers: number;
  sel: number;
  onSel: (layer: number) => void;
  hasContent: (layer: number) => boolean;
  live: number;
  titleFor: (layer: number) => string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {Array.from({ length: numLayers }, (_, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSel(n)}
          title={titleFor(n)}
          className={cx(
            "relative flex h-7 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-md border px-1.5 font-mono text-[11.5px] transition-colors duration-120",
            n === sel
              ? "border-accent bg-accent-dim/30 text-accent"
              : "border-line bg-raised text-mute hover:border-line-strong",
          )}
        >
          L{n}
          {hasContent(n) && <span className="size-1 rounded-full bg-accent" />}
          {n === live && (
            <span className="absolute -top-0.5 right-0.5 size-1 rounded-full bg-ok" />
          )}
        </button>
      ))}
    </div>
  );
}

const POLICIES: Array<{ id: LightingLayerPolicy; label: string; hint: string }> = [
  { id: "EffectiveOnly", label: "Effective only", hint: "Light only the topmost active layer" },
  { id: "ActiveStack", label: "Stack active layers", hint: "Composite every active layer, top wins" },
];

function DeviceScenes({ status }: { status: LightingSceneStatus }) {
  const { bundle, state, io } = useWorkbench();
  const serial = bundle.info.serial_number;
  const numLayers = bundle.caps.num_layers;

  // Presets left in this browser by pre-scene firmware sessions.
  const [localPresets, setLocalPresets] = useState<PresetMap>(() => load(serial).presets);
  const localCount = Object.keys(localPresets).length;

  /** Layers with a local preset take that preset; the rest pass through. */
  const copyLocalPresets = () => {
    const migrated = new Set(
      Object.keys(localPresets)
        .map(Number)
        .filter((layer) => layer >= 0 && layer < numLayers),
    );
    const cells = state.scenes.filter((cell) => !migrated.has(cell.layer));
    for (const layer of migrated) {
      for (const cell of localPresets[layer].cells) {
        cells.push({ layer, led_id: cell.led_id, effect: cell.effect });
      }
    }
    io.applyScenes(cells);
    setLocalPresets({});
  };

  return (
    <div>
      <SectionLabel>Layer lighting</SectionLabel>

      <div className="mt-2 flex flex-col gap-2">
        <div className="tnum text-[11px] text-faint">
          {state.scenes.length}/{status.capacity} scene cells used
        </div>

        <div>
          <div className="text-[11px] text-faint">When several layers are active</div>
          <div className="mt-1 flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
            {POLICIES.map((policy) => (
              <button
                key={policy.id}
                type="button"
                title={policy.hint}
                disabled={state.lightingBusy}
                onClick={() => io.setScenePolicy(policy.id)}
                className={cx(
                  "flex-1 cursor-pointer rounded-md py-1.5 text-[11.5px] font-medium transition-colors duration-120",
                  state.scenePolicy === policy.id
                    ? "bg-raised text-ink shadow-sm"
                    : "text-faint hover:text-mute",
                )}
              >
                {policy.label}
              </button>
            ))}
          </div>
        </div>

        {localCount > 0 && (
          <Button
            variant="outline"
            className="py-1"
            title="Write the layer presets saved in this browser onto the keyboard"
            disabled={state.lightingBusy}
            onClick={copyLocalPresets}
          >
            Copy {localCount} local preset{localCount === 1 ? "" : "s"} to keyboard
          </Button>
        )}

        <div className="text-[10.5px] leading-relaxed text-faint">
          Edit each layer's scene with the target tabs above the board. Scenes are stored on the
          keyboard — layer lighting keeps working after Rynkbench disconnects, and survives reboot.
        </div>
      </div>
    </div>
  );
}

function LocalPresets() {
  const { bundle, state, io } = useWorkbench();
  const serial = bundle.info.serial_number;
  const numLayers = bundle.caps.num_layers;

  const [stored, setStored] = useState<Stored>(() => load(serial));
  const [sel, setSel] = useState(state.currentLayer);
  const [applied, setApplied] = useState<number | null>(null);

  const save = useCallback(
    (next: Stored) => {
      setStored(next);
      try {
        localStorage.setItem(storageKey(serial), JSON.stringify(next));
      } catch {
        // storage full/unavailable — presets simply won't persist
      }
    },
    [serial],
  );

  const applyLayer = useCallback(
    (layer: number, presets: PresetMap) => {
      const preset = presets[layer];
      if (preset) {
        io.applyOverlay(preset.cells);
        setApplied(layer);
      } else {
        io.clearOverlay();
        setApplied(null);
      }
    },
    [io],
  );

  // Follow the live layer: apply on change (and once on enable).
  const lastFollowed = useRef<number | null>(null);
  useEffect(() => {
    if (!stored.follow) {
      lastFollowed.current = null;
      return;
    }
    if (lastFollowed.current === state.currentLayer) return;
    lastFollowed.current = state.currentLayer;
    applyLayer(state.currentLayer, stored.presets);
  }, [stored.follow, stored.presets, state.currentLayer, applyLayer]);

  const preset = stored.presets[sel];
  const drawnCount = Object.keys(state.draft).length;

  return (
    <div>
      <SectionLabel>Layer lighting</SectionLabel>

      <LayerChips
        numLayers={numLayers}
        sel={sel}
        onSel={setSel}
        hasContent={(n) => stored.presets[n] !== undefined}
        live={state.currentLayer}
        titleFor={(n) =>
          `Layer ${n}${
            stored.presets[n] ? ` · ${stored.presets[n].name}` : " · no preset"
          }${n === state.currentLayer ? " · live" : ""}`
        }
      />

      <div className="mt-2.5 flex flex-col gap-2">
        {preset ? (
          <>
            <div className="flex items-center gap-2">
              <TextInput
                value={preset.name}
                onChange={(e) =>
                  save({
                    ...stored,
                    presets: { ...stored.presets, [sel]: { ...preset, name: e.target.value } },
                  })
                }
                className="py-1"
                placeholder={`Layer ${sel} preset`}
              />
              <button
                type="button"
                title={`Remove the Layer ${sel} preset`}
                onClick={() => {
                  const presets = { ...stored.presets };
                  delete presets[sel];
                  save({ ...stored, presets });
                  if (applied === sel) setApplied(null);
                }}
                className="cursor-pointer rounded-md border border-line p-1.5 text-faint transition-colors duration-120 hover:border-danger/50 hover:text-danger"
              >
                <TrashIcon size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 py-1"
                disabled={state.lightingBusy}
                onClick={() => applyLayer(sel, stored.presets)}
              >
                Apply now
              </Button>
              <Button
                variant="ghost"
                className="py-1"
                title="Overwrite this preset with the current staged overlay"
                disabled={drawnCount === 0}
                onClick={() =>
                  save({
                    ...stored,
                    presets: {
                      ...stored.presets,
                      [sel]: { ...preset, cells: Object.values(state.draft) },
                    },
                  })
                }
              >
                Update
              </Button>
            </div>
            <div className="tnum text-[11px] text-faint">
              {preset.cells.length} lit key{preset.cells.length === 1 ? "" : "s"}
              {applied === sel && (
                <span className="text-accent">
                  {" "}
                  · applied{stored.follow ? " · following" : ""}
                </span>
              )}
            </div>
          </>
        ) : (
          <Button
            variant="outline"
            className="py-1"
            disabled={drawnCount === 0}
            title={
              drawnCount === 0
                ? "Paint some keys first, then save them as this layer's preset"
                : `Save the current ${drawnCount}-key overlay as the Layer ${sel} preset`
            }
            onClick={() =>
              save({
                ...stored,
                presets: {
                  ...stored.presets,
                  [sel]: { name: `Layer ${sel}`, cells: Object.values(state.draft) },
                },
              })
            }
          >
            Save current overlay as L{sel} preset
          </Button>
        )}

        <label className="flex cursor-pointer items-center justify-between text-[12.5px] text-mute">
          <span>Follow live layer</span>
          <input
            type="checkbox"
            checked={stored.follow}
            onChange={(e) => save({ ...stored, follow: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>
        {stored.follow && applied !== null && (
          <div className="text-[11px] text-accent">
            L{applied} preset applied · following the live layer
          </div>
        )}
        <div className="text-[10.5px] leading-relaxed text-faint">
          Applied by Rynkbench while connected — presets live in this browser, not on the
          keyboard.
        </div>
      </div>
    </div>
  );
}
