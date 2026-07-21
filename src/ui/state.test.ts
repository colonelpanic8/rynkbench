// Reducer coverage for per-target lighting drafts: the overlay draft and each
// layer's scene draft are staged independently and stage against different
// baselines (applied overlay vs. that layer's stored scene cells).

import { describe, expect, it } from "vitest";
import type { LightingEffect, LightingSceneCell, LightingState } from "../vendor/rynk-wasm/rynk_wasm";
import {
  activeLightingBase,
  activeLightingDraft,
  makeWorkbenchReducer,
  stagedBetween,
  type WorkbenchState,
} from "./state";

const reducer = makeWorkbenchReducer(2);

function solid(r: number): LightingEffect {
  return { Solid: { color: { r, g: 0, b: 0 } } };
}

const LIGHTING: LightingState = {
  revision: 1,
  output_enabled: true,
  output_brightness: 200,
  background: { enabled: false, hue: 0, saturation: 0, value: 0, speed: 0, mode: "Solid" },
  overlay_len: 0,
};

function baseState(over: Partial<WorkbenchState> = {}): WorkbenchState {
  return {
    mode: "lighting",
    uiLayer: 0,
    currentLayer: 0,
    defaultLayer: 0,
    layers: [[], []],
    encoders: {},
    battery: "Unavailable",
    connection: null,
    lightingState: LIGHTING,
    applied: {},
    draft: {},
    lightingTarget: "overlay",
    layerDrafts: {},
    scenes: [],
    compiledScenes: [],
    scenePolicy: "EffectiveOnly",
    compiledScenePolicy: "EffectiveOnly",
    selection: null,
    pending: {},
    lightingBusy: false,
    lightingError: null,
    hoverLeds: null,
    lightingSelection: [],
    paintTick: {},
    combos: [],
    morse: [],
    forks: [],
    macroBytes: new Uint8Array(),
    behavior: null,
    ledIndicator: null,
    ...over,
  };
}

describe("per-target lighting drafts", () => {
  it("seeds a layer draft from that layer's stored scene cells on first select", () => {
    const scenes: LightingSceneCell[] = [
      { layer: 1, led_id: 5, effect: solid(9) },
      { layer: 0, led_id: 2, effect: solid(3) },
    ];
    const s = reducer(baseState({ scenes }), { type: "lightingTarget", target: 1 });
    expect(s.lightingTarget).toBe(1);
    // Only layer 1's cell, as an overlay-shaped (ttl-less) draft.
    expect(activeLightingDraft(s)).toEqual({ 5: { led_id: 5, effect: solid(9), ttl_ms: undefined } });
    expect(activeLightingDraft(s)).toEqual(activeLightingBase(s));
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s)).size).toBe(0);
  });

  it("routes paint/erase to the active target and leaves other targets untouched", () => {
    let s = baseState({ scenes: [{ layer: 1, led_id: 5, effect: solid(9) }] });
    // Paint the overlay.
    s = reducer(s, { type: "paint", cells: [{ led_id: 1, effect: solid(1), ttl_ms: undefined }] });
    // Switch to layer 1 and paint there.
    s = reducer(s, { type: "lightingTarget", target: 1 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 7, effect: solid(7), ttl_ms: undefined }] });

    expect(s.draft).toEqual({ 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } });
    expect(s.layerDrafts[1]).toEqual({
      5: { led_id: 5, effect: solid(9), ttl_ms: undefined },
      7: { led_id: 7, effect: solid(7), ttl_ms: undefined },
    });
    // Layer 1 now has one staged edit (led 7) over its stored baseline.
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s))).toEqual(new Set([7]));
  });

  it("preserves each target's staged edits across tab switches", () => {
    let s = baseState();
    s = reducer(s, { type: "paint", cells: [{ led_id: 1, effect: solid(1), ttl_ms: undefined }] });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 2, effect: solid(2), ttl_ms: undefined }] });
    // Bounce back to overlay, then to the layer again.
    s = reducer(s, { type: "lightingTarget", target: "overlay" });
    expect(activeLightingDraft(s)).toEqual({ 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    expect(activeLightingDraft(s)).toEqual({ 2: { led_id: 2, effect: solid(2), ttl_ms: undefined } });
  });

  it("draftReset returns the active layer draft to its stored scene baseline", () => {
    let s = baseState({ scenes: [{ layer: 0, led_id: 2, effect: solid(3) }] });
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "erase", ledIds: [2] });
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s))).toEqual(new Set([2]));
    s = reducer(s, { type: "draftReset" });
    expect(activeLightingDraft(s)).toEqual({ 2: { led_id: 2, effect: solid(3), ttl_ms: undefined } });
    expect(stagedBetween(activeLightingDraft(s), activeLightingBase(s)).size).toBe(0);
  });

  it("scenesApplied re-syncs clean layer drafts but keeps dirty ones", () => {
    let s = baseState({ scenes: [{ layer: 0, led_id: 2, effect: solid(3) }] });
    // Seed layer 0 (clean) and layer 1 (dirty).
    s = reducer(s, { type: "lightingTarget", target: 0 });
    s = reducer(s, { type: "lightingTarget", target: 1 });
    s = reducer(s, { type: "paint", cells: [{ led_id: 8, effect: solid(8), ttl_ms: undefined }] });

    const newScenes: LightingSceneCell[] = [{ layer: 0, led_id: 4, effect: solid(4) }];
    s = reducer(s, { type: "scenesApplied", state: LIGHTING, cells: newScenes });

    // Layer 0 was clean → re-synced to the new stored table.
    expect(s.layerDrafts[0]).toEqual({ 4: { led_id: 4, effect: solid(4), ttl_ms: undefined } });
    // Layer 1 had a staged edit → untouched.
    expect(s.layerDrafts[1]).toEqual({ 8: { led_id: 8, effect: solid(8), ttl_ms: undefined } });
  });

  it("overlay draft still stages against the applied overlay", () => {
    const overlay = { 1: { led_id: 1, effect: solid(1), ttl_ms: undefined } };
    const s = baseState({ applied: overlay, draft: { ...overlay } });
    expect(activeLightingBase(s)).toBe(s.applied);
    const painted = reducer(s, {
      type: "paint",
      cells: [{ led_id: 2, effect: solid(2), ttl_ms: undefined }],
    });
    expect(stagedBetween(activeLightingDraft(painted), activeLightingBase(painted))).toEqual(
      new Set([2]),
    );
  });
});
