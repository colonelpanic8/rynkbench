// Effects mode: the firmware's animated effect pack as a first-class view.
// The gallery picks the base effect (and, where the firmware carries a second
// slot, the overlay); the inspector carries palette, brightness, speed and
// whatever generic per-effect parameters the device advertises for each staged
// effect — parameters live per effect on the device, so the base and overlay
// slots each get their own block. Everything is staged locally and applied via
// lighting.setExtensionState; the device's returned state is the source of
// truth. Nothing here is named or bounded locally — every label and range
// comes from the connected firmware.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LightingExtensionParam,
  LightingExtensionState,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { ExtensionParamWrite } from "../state";
import { paramEffects, useWorkbench } from "../state";
import { Button, Chip, InspectorShell, SectionLabel, TextInput, cx } from "../kit";
import { SpinnerIcon, WarningIcon } from "../icons";
import { Slider } from "../lighting/BackgroundPanel";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Which slot the gallery is assigning to. */
type Slot = "base" | "overlay";

/** Staged parameter values, keyed by the effect whose list they describe. */
type ParamDrafts = Record<number, number[]>;

/** One effect's parameter block as rendered in the inspector. */
interface ParamBlock {
  effect: number;
  slots: Slot[];
  items: LightingExtensionParam[];
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

  // Parameters belong to the *staged* effects: the protocol serves any effect's
  // list, so picking one in the gallery previews its parameters before Apply.
  // Both slots are tracked, since each names its own effect on the device.
  const stagedEffect = draft?.effect ?? null;
  const stagedOverlay = extensionLayers === null ? undefined : overlayDraft;
  const staged = useMemo(
    () => (stagedEffect === null ? [] : paramEffects(stagedEffect, stagedOverlay)),
    [stagedEffect, stagedOverlay],
  );

  const loadParams = io.loadExtensionParams;
  useEffect(() => {
    for (const effect of staged) loadParams(effect);
  }, [staged, loadParams]);

  const store = state.extensionParams;

  // Parameter drafts mirror the selection draft's follow-when-clean rule, and
  // are keyed by effect so switching effects never carries values over.
  const [paramDrafts, setParamDrafts] = useState<ParamDrafts>({});
  const loadedRef = useRef<ParamDrafts>({});
  useEffect(() => {
    const previous = loadedRef.current;
    const fresh: ParamDrafts = { ...previous };
    for (const effect of staged) {
      const items = store[effect];
      if (items !== undefined) fresh[effect] = items.map((param) => param.value);
    }
    loadedRef.current = fresh;
    setParamDrafts((current) => {
      let next = current;
      for (const effect of staged) {
        const values = fresh[effect];
        if (values === undefined) continue;
        const held = current[effect];
        // Staged edits survive a device push, like the selection draft.
        if (held !== undefined && previous[effect] !== undefined) {
          if (!same(held, previous[effect])) continue;
          if (same(held, values)) continue;
        }
        if (next === current) next = { ...current };
        next[effect] = values;
      }
      return next;
    });
  }, [store, staged]);

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

  // One block per staged effect, but only where the device advertised
  // parameters for it and the draft has caught up with them.
  const blocks: ParamBlock[] = staged.flatMap((effect) => {
    const items = store[effect];
    const values = paramDrafts[effect];
    if (items === undefined || items.length === 0) return [];
    if (values === undefined || values.length !== items.length) return [];
    return [{ effect, slots: assignedFor(effect), items, values }];
  });

  const paramWrites: ExtensionParamWrite[] = blocks.flatMap((block) =>
    block.items.flatMap((param, index) =>
      block.values[index] === param.value
        ? []
        : [{ effect: block.effect, index, value: block.values[index] }],
    ),
  );

  const setParam = (effect: number, index: number, value: number) =>
    setParamDrafts((current) => {
      const values = current[effect];
      if (values === undefined) return current;
      return { ...current, [effect]: values.map((v, i) => (i === index ? value : v)) };
    });

  const revertParams = () =>
    setParamDrafts((current) => {
      const next = { ...current };
      for (const effect of staged) {
        const items = store[effect];
        if (items !== undefined) next[effect] = items.map((param) => param.value);
      }
      return next;
    });

  const dirty =
    !same(draft, clean) ||
    overlayDraft !== extensionLayers?.overlay ||
    paramWrites.length > 0;

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

          {blocks.map((block) => (
            <div
              key={block.effect}
              className="flex flex-col gap-2 border-t border-line-soft pt-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <SectionLabel>{effectName(block.effect)} parameters</SectionLabel>
                  {hasOverlaySlot &&
                    block.slots.map((s) => (
                      <Chip key={s} tone={s === "base" ? "accent" : "neutral"}>
                        {s}
                      </Chip>
                    ))}
                </div>
                <Button
                  variant="ghost"
                  className="px-1.5 py-0 text-[10.5px]"
                  disabled={block.items.every(
                    (param, index) => block.values[index] === param.default,
                  )}
                  onClick={() =>
                    setParamDrafts((current) => ({
                      ...current,
                      [block.effect]: block.items.map((param) => param.default),
                    }))
                  }
                >
                  Defaults
                </Button>
              </div>
              {block.items.map((param, index) => (
                <Slider
                  key={`${block.effect}:${index}:${param.name}`}
                  label={param.name}
                  min={param.min}
                  max={param.max}
                  value={block.values[index]}
                  onChange={(value) => setParam(block.effect, index, value)}
                />
              ))}
            </div>
          ))}
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
