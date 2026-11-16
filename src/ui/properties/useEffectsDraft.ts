// The firmware's effects as one draft: the effect, the overlay effect (where
// the firmware has a second slot), palette, value and speed, and each staged
// effect's own parameters. Staged locally and applied in one go with
// io.setExtensionState; the keyboard's returned state is the source of truth.
// Effects are on while their value is above zero: that is what the firmware's
// RGB toggle flips. For Layout properties' RGB Effects tab (EffectsSection).
// Names and ranges all come from the connected firmware.

import { useEffect, useMemo, useRef, useState } from "react";
import type { LightingExtensionParam, LightingExtensionState } from "../../model/lighting-types";
import type { ExtensionParamWrite } from "../../workbench";
import { paramEffects } from "../../workbench";
import { useWorkbench } from "../state";
import { useDeviceDraft } from "../device-draft";
import { SETTING_KEYS, readSetting, writeSetting } from "../settings";
import { same } from "../../model/deep-equal";

/** Staged parameter values, keyed by the effect whose list they describe. */
type ParamDrafts = Record<number, number[]>;

/** One effect's parameters as the screens show them. */
export interface ParamBlock {
  effect: number;
  items: LightingExtensionParam[];
  values: number[];
}

/** The value effects come back on at when nothing earlier is known. */
const ON_VALUE = 128;

export function useEffectsDraft() {
  const { bundle, state, io } = useWorkbench();
  const extension = state.lightingExtension;
  const extensionLayers = state.lightingExtensionLayers;

  const device = useMemo<LightingExtensionState | null>(() => (extension ? { ...extension.state } : null), [extension]);
  const { draft, setDraft, dirty: selectionDirty, reset: resetDraft } = useDeviceDraft(device);
  const { draft: overlayDraft, setDraft: setOverlayDraft, dirty: overlayDirty, reset: resetOverlay } = useDeviceDraft(
    extensionLayers?.overlay,
  );
  // The brightness to turn effects back on at: the last one the keyboard had
  // above zero, kept in the browser so it outlives this window (the keyboard
  // stores the 0 while they are off).
  const onKey = SETTING_KEYS.effectsOnValue(bundle.info.serial_number);
  const lastOn = useRef(Math.min(255, Number(readSetting(onKey))) || ON_VALUE);
  const applied = device?.value ?? 0;
  useEffect(() => {
    if (applied > 0 && applied !== lastOn.current) {
      lastOn.current = applied;
      writeSetting(onKey, String(applied));
    }
  }, [applied, onKey]);

  // Parameters belong to the *staged* effects: the protocol serves any effect's
  // list, so picking one previews its parameters before Apply.
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
  // Parameter drafts follow the keyboard while untouched, and are keyed by
  // effect so switching effects never carries values over.
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
        // Staged edits survive a push from the keyboard, like the selection draft.
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

  const hasOverlaySlot = extensionLayers !== null;

  // One block per staged effect, where the keyboard advertised parameters and
  // the draft has caught up with them.
  const blocks: ParamBlock[] = staged.flatMap((effect) => {
    const items = store[effect];
    const values = paramDrafts[effect];
    if (items === undefined || items.length === 0) return [];
    if (values === undefined || values.length !== items.length) return [];
    return [{ effect, items, values }];
  });
  const paramWrites: ExtensionParamWrite[] = blocks.flatMap((block) =>
    block.items.flatMap((param, index) =>
      block.values[index] === param.value ? [] : [{ effect: block.effect, index, value: block.values[index] }],
    ),
  );
  const effects = bundle.extensionEffectNames;

  return {
    /** Null when the firmware has no effects. */
    draft,
    setDraft,
    overlayDraft,
    setOverlayDraft,
    hasOverlaySlot,
    blocks,
    effects,
    palettes: bundle.extensionPaletteNames,
    effectName: (index: number | undefined) => (index === undefined ? "None" : (effects[index] ?? `Effect ${index}`)),
    /** Effects render while their value is above zero. */
    on: (draft?.value ?? 0) > 0,
    setOn(on: boolean) {
      if (draft) setDraft({ ...draft, value: on ? lastOn.current : 0 });
    },
    setParam: (effect: number, index: number, value: number) =>
      setParamDrafts((current) => {
        const values = current[effect];
        if (values === undefined) return current;
        return { ...current, [effect]: values.map((v, i) => (i === index ? value : v)) };
      }),
    defaults: (block: ParamBlock) => setParamDrafts((current) => ({ ...current, [block.effect]: block.items.map((param) => param.default) })),
    dirty: selectionDirty || overlayDirty || paramWrites.length > 0,
    busy: state.lightingBusy,
    error: state.lightingError,
    apply: () => draft && io.setExtensionState({ ...draft }, paramWrites, overlayDraft),
    revert() {
      resetDraft();
      resetOverlay();
      setParamDrafts((current) => {
        const next = { ...current };
        for (const effect of staged) {
          const items = store[effect];
          if (items !== undefined) next[effect] = items.map((param) => param.value);
        }
        return next;
      });
    },
  };
}

export type EffectsDraft = ReturnType<typeof useEffectsDraft>;
