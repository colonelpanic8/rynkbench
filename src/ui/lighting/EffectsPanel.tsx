// Extension effects: the firmware's animated effect pack (effect + palette
// selection, brightness and speed), plus whatever generic per-effect
// parameters the device advertises for the staged effect. Staged locally,
// applied via lighting.setExtensionState; the device's returned state is the
// source of truth. Hidden entirely on firmware without EXTENSION_EFFECTS;
// the parameter block is hidden on firmware without the parameter surface and
// on effects that declare no parameters. Nothing here is named or bounded
// locally — every label and range comes from the device.

import { useEffect, useRef, useState } from "react";
import type { LightingExtensionState } from "../../vendor/rynk-wasm/rynk_wasm";
import type { ExtensionParamWrite } from "../state";
import { useWorkbench } from "../state";
import { Button, SectionLabel } from "../kit";
import { Slider } from "./BackgroundPanel";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Staged parameter values, pinned to the effect whose list they describe. */
interface ParamDraft {
  effect: number;
  values: number[];
}

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

  // Parameters belong to the *staged* effect: the protocol serves any effect's
  // list, so picking one in the dropdown previews its parameters before Apply.
  const stagedEffect = draft?.effect ?? null;
  const loadParams = io.loadExtensionParams;
  useEffect(() => {
    if (stagedEffect === null) return;
    loadParams(stagedEffect);
  }, [stagedEffect, loadParams]);

  const loaded =
    state.extensionParams !== null && state.extensionParams.effect === stagedEffect
      ? state.extensionParams.items
      : null;

  // The parameter draft mirrors the selection draft's follow-when-clean rule,
  // and is pinned to its effect so switching effects never carries values over.
  const [paramDraft, setParamDraft] = useState<ParamDraft | null>(null);
  const loadedRef = useRef<ParamDraft | null>(null);
  useEffect(() => {
    if (stagedEffect === null || loaded === null) return;
    const values = loaded.map((param) => param.value);
    const previous = loadedRef.current;
    loadedRef.current = { effect: stagedEffect, values };
    setParamDraft((current) =>
      current !== null &&
      current.effect === stagedEffect &&
      previous !== null &&
      previous.effect === stagedEffect &&
      !same(current.values, previous.values)
        ? current // staged edits survive a device push, like the selection draft
        : { effect: stagedEffect, values },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stagedEffect]);

  if (!extension || !draft) return null;

  const effects = bundle.extensionEffectNames;
  const palettes = bundle.extensionPaletteNames;
  const clean = toDraft();

  // Render parameters only when the device advertised some for this effect and
  // the draft has caught up with them.
  const paramValues =
    loaded !== null &&
    loaded.length > 0 &&
    paramDraft !== null &&
    paramDraft.effect === draft.effect &&
    paramDraft.values.length === loaded.length
      ? paramDraft.values
      : null;
  const params = paramValues === null ? null : loaded;
  const paramWrites: ExtensionParamWrite[] =
    params === null || paramValues === null
      ? []
      : params.flatMap((param, index) =>
          paramValues[index] === param.value ? [] : [{ index, value: paramValues[index] }],
        );
  const atDefaults =
    params === null || paramValues === null
      ? true
      : params.every((param, index) => paramValues[index] === param.default);

  const setParam = (index: number, value: number) =>
    setParamDraft((current) =>
      current === null
        ? current
        : { effect: current.effect, values: current.values.map((v, i) => (i === index ? value : v)) },
    );

  const revertParams = () =>
    setParamDraft(
      loaded === null ? null : { effect: draft.effect, values: loaded.map((p) => p.value) },
    );

  const dirty = !same(draft, clean) || paramWrites.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Firmware effect extension</SectionLabel>
        {dirty && <span className="text-[10.5px] text-warn">unapplied</span>}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Names and control behavior are supplied by the connected firmware.
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {effects.length > 0 && (
          <NameSelect
            label="Effect"
            names={effects}
            value={draft.effect}
            onChange={(effect) => setDraft({ ...draft, effect })}
          />
        )}
        {palettes.length > 0 && (
          <NameSelect
            label="Palette"
            names={palettes}
            value={draft.palette}
            onChange={(palette) => setDraft({ ...draft, palette })}
          />
        )}
        <Slider
          label="Value"
          value={draft.value}
          onChange={(value) => setDraft({ ...draft, value })}
        />
        <Slider
          label="Speed"
          value={draft.speed}
          onChange={(speed) => setDraft({ ...draft, speed })}
        />

        {params !== null && paramValues !== null && (
          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>{effects[draft.effect] ?? "Effect"} parameters</SectionLabel>
              <Button
                variant="ghost"
                className="px-1.5 py-0 text-[10.5px]"
                disabled={atDefaults}
                onClick={() =>
                  setParamDraft({
                    effect: draft.effect,
                    values: params.map((param) => param.default),
                  })
                }
              >
                Defaults
              </Button>
            </div>
            {params.map((param, index) => (
              <Slider
                key={`${draft.effect}:${index}:${param.name}`}
                label={param.name}
                min={param.min}
                max={param.max}
                value={paramValues[index]}
                onChange={(value) => setParam(index, value)}
              />
            ))}
          </div>
        )}

        {dirty && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              className="flex-1 py-1"
              disabled={state.lightingBusy}
              onClick={() => io.setExtensionState({ ...draft }, paramWrites)}
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              className="py-1"
              onClick={() => {
                setDraft(clean);
                revertParams();
              }}
            >
              Revert
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
