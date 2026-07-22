// Extension effects: the firmware's animated effect pack (effect + palette
// selection, brightness and speed). Staged locally, applied via
// lighting.setExtensionState; the device's returned state is the source of
// truth. Hidden entirely on firmware without EXTENSION_EFFECTS.

import { useEffect, useRef, useState } from "react";
import type { LightingExtensionState } from "../../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "../state";
import { Button, SectionLabel } from "../kit";
import { Slider } from "./BackgroundPanel";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function NameSelect({
  label,
  names,
  value,
  onChange,
}: {
  label: string;
  names: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12.5px] text-mute">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 max-w-[60%] rounded-lg border border-line bg-well px-2 py-1 text-[12.5px] text-ink"
      >
        {names.map((name, index) => (
          <option key={index} value={index}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EffectsPanel() {
  const { bundle, state, io } = useWorkbench();
  const extension = state.lightingExtension;

  const toDraft = (): LightingExtensionState | null =>
    extension ? { ...extension.state } : null;

  const [draft, setDraft] = useState<LightingExtensionState | null>(toDraft);

  // Follow device pushes while the draft is clean.
  const deviceRef = useRef(toDraft());
  useEffect(() => {
    const next = toDraft();
    if (same(draft, deviceRef.current)) setDraft(next);
    deviceRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension]);

  if (!extension || !draft) return null;

  const effects = bundle.extensionEffectNames;
  const palettes = bundle.extensionPaletteNames;
  const clean = toDraft();
  const dirty = !same(draft, clean);

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Extension effects</SectionLabel>
        {dirty && <span className="text-[10.5px] text-warn">unapplied</span>}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <NameSelect
          label="Effect"
          names={effects}
          value={draft.effect}
          onChange={(effect) => setDraft({ ...draft, effect })}
        />
        <NameSelect
          label="Palette"
          names={palettes}
          value={draft.palette}
          onChange={(palette) => setDraft({ ...draft, palette })}
        />
        <Slider
          label="Brightness"
          value={draft.value}
          onChange={(value) => setDraft({ ...draft, value })}
        />
        <Slider
          label="Speed"
          value={draft.speed}
          onChange={(speed) => setDraft({ ...draft, speed })}
        />

        {dirty && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              className="flex-1 py-1"
              disabled={state.lightingBusy}
              onClick={() => io.setExtensionState({ ...draft })}
            >
              Apply
            </Button>
            <Button variant="ghost" className="py-1" onClick={() => setDraft(clean)}>
              Revert
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
