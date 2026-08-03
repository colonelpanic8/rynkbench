// Effects mode: the firmware's animated effect pack as a first-class view.
// The gallery picks the base effect (and, where the firmware carries a second
// slot, the overlay); the inspector carries palette, brightness, speed and
// whatever generic per-effect parameters the device advertises for the staged
// effect. Everything is staged locally and applied via
// lighting.setExtensionState; the device's returned state is the source of
// truth. Nothing here is named or bounded locally — every label and range
// comes from the connected firmware.

import { useEffect, useMemo, useRef, useState } from "react";
import type { LightingExtensionState } from "../../vendor/rynk-wasm/rynk_wasm";
import type { ExtensionParamWrite } from "../state";
import { useWorkbench } from "../state";
import { Button, Chip, InspectorShell, SectionLabel, TextInput, cx } from "../kit";
import { SpinnerIcon, WarningIcon } from "../icons";
import { Slider } from "../lighting/BackgroundPanel";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Which slot the gallery is assigning to. */
type Slot = "base" | "overlay";

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

/** One effect tile. `assigned` marks the slots this effect currently fills. */
function EffectCard({
  name,
  index,
  selected,
  assigned,
  onClick,
}: {
  name: string;
  index: number | null;
  selected: boolean;
  assigned: Slot[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={index === null ? "Leave the overlay slot empty" : `Effect ${index} · ${name}`}
      className={cx(
        "flex cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-120",
        selected
          ? "border-accent-deep bg-accent-dim/30 text-ink"
          : "border-line bg-raised text-mute hover:border-line-strong hover:text-ink",
      )}
      aria-pressed={selected}
    >
      <span className="truncate text-[12.5px] font-medium">{name}</span>
      <span className="flex min-h-4 items-center gap-1.5">
        {assigned.includes("base") && <Chip tone="accent">base</Chip>}
        {assigned.includes("overlay") && <Chip tone="neutral">overlay</Chip>}
        <span className="flex-1" />
        {index !== null && <span className="tnum text-[10.5px] text-faint">#{index}</span>}
      </span>
    </button>
  );
}

export function EffectsMode() {
  const { bundle, state, io } = useWorkbench();
  const extension = state.lightingExtension;
  const extensionLayers = state.lightingExtensionLayers;

  const toDraft = (): LightingExtensionState | null =>
    extension ? { ...extension.state } : null;

  const [draft, setDraft] = useState<LightingExtensionState | null>(toDraft);
  const [overlayDraft, setOverlayDraft] = useState<number | undefined>(
    extensionLayers?.overlay,
  );
  const [slot, setSlot] = useState<Slot>("base");
  const [filter, setFilter] = useState("");

  // Follow device pushes while the draft is clean.
  const deviceRef = useRef(toDraft());
  useEffect(() => {
    const next = toDraft();
    if (same(draft, deviceRef.current)) setDraft(next);
    deviceRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension]);

  const overlayDeviceRef = useRef(extensionLayers?.overlay);
  useEffect(() => {
    const next = extensionLayers?.overlay;
    if (overlayDraft === overlayDeviceRef.current) setOverlayDraft(next);
    overlayDeviceRef.current = next;
  }, [extensionLayers, overlayDraft]);

  // Parameters belong to the *staged* effect: the protocol serves any effect's
  // list, so picking one in the gallery previews its parameters before Apply.
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

  const effects = bundle.extensionEffectNames;
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const all = effects.map((name, index) => ({ name, index }));
    return needle === "" ? all : all.filter((e) => e.name.toLowerCase().includes(needle));
  }, [effects, filter]);

  if (!extension || !draft) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12.5px] text-faint">
        This firmware has no effect extension.
      </div>
    );
  }

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

  const dirty =
    !same(draft, clean) ||
    overlayDraft !== extensionLayers?.overlay ||
    paramWrites.length > 0;

  const hasOverlaySlot = extensionLayers !== null;
  const activeSlot = hasOverlaySlot ? slot : "base";
  const pick = (index: number | null) => {
    if (activeSlot === "base") {
      if (index !== null) setDraft({ ...draft, effect: index });
    } else {
      setOverlayDraft(index ?? undefined);
    }
  };
  const slotValue = activeSlot === "base" ? draft.effect : overlayDraft;
  const assignedFor = (index: number): Slot[] => {
    const slots: Slot[] = [];
    if (draft.effect === index) slots.push("base");
    if (hasOverlaySlot && overlayDraft === index) slots.push("overlay");
    return slots;
  };

  const effectName = (index: number | undefined) =>
    index === undefined ? "None" : (effects[index] ?? `Effect ${index}`);

  const outputOff = state.lightingState?.output_enabled === false;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <SectionLabel>Effects</SectionLabel>
          <span className="tnum text-[12px] text-faint">
            {effects.length} from firmware
            {filter.trim() !== "" && ` · ${visible.length} shown`}
          </span>
          {outputOff && (
            <span className="text-[11.5px] text-warn">lighting output is off</span>
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          {hasOverlaySlot && (
            <div className="flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
              {(
                [
                  {
                    id: "base",
                    label: `Base · ${effectName(draft.effect)}`,
                    title: "The effect the pack renders across the board",
                  },
                  {
                    id: "overlay",
                    label: `Overlay · ${effectName(overlayDraft)}`,
                    title: "A second effect composited over the base — optional",
                  },
                ] as const
              ).map(({ id, label, title }) => (
                <button
                  key={id}
                  type="button"
                  title={title}
                  onClick={() => setSlot(id)}
                  className={cx(
                    "cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors duration-120",
                    activeSlot === id
                      ? "bg-raised text-ink shadow-sm"
                      : "text-faint hover:text-mute",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <div className="w-44 shrink-0">
            <TextInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter effects"
              className="text-[12px]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line-soft bg-well p-3">
          {effects.length === 0 ? (
            <p className="text-[12.5px] text-faint">
              This firmware advertises no effect names.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
              {activeSlot === "overlay" && filter.trim() === "" && (
                <EffectCard
                  name="None"
                  index={null}
                  selected={overlayDraft === undefined}
                  assigned={[]}
                  onClick={() => pick(null)}
                />
              )}
              {visible.map(({ name, index }) => (
                <EffectCard
                  key={index}
                  name={name}
                  index={index}
                  selected={slotValue === index}
                  assigned={assignedFor(index)}
                  onClick={() => pick(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <InspectorShell>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between">
              <SectionLabel>Firmware effect extension</SectionLabel>
              {dirty && <span className="text-[10.5px] text-warn">unapplied</span>}
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
              Names and control behavior are supplied by the connected firmware.
            </p>
          </div>

          <div className="flex flex-col gap-2">
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
          </div>

          {params !== null && paramValues !== null && (
            <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>{effectName(draft.effect)} parameters</SectionLabel>
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
        </div>

        <div className="mt-4 border-t border-line-soft pt-3">
          {state.lightingError && (
            <div className="mb-2 flex items-center gap-2 text-[12px] text-danger">
              <WarningIcon size={13} />
              <span className="min-w-0 flex-1 truncate" title={state.lightingError}>
                {state.lightingError}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={!dirty || state.lightingBusy}
              onClick={() => io.setExtensionState({ ...draft }, paramWrites, overlayDraft)}
            >
              {state.lightingBusy && <SpinnerIcon size={13} />}
              Apply
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                setDraft(clean);
                setOverlayDraft(extensionLayers?.overlay);
                revertParams();
              }}
            >
              Revert
            </Button>
          </div>
        </div>
      </InspectorShell>
    </>
  );
}
