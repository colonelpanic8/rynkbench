// The keyboard on the keymap screen: the layer heading, the canvas with its
// selection, drag-to-move, copy and paste, the key quick menu and the hover
// card. Keys are edited below it (KeyEditor.tsx); trackpads and encoders in
// SideInspector.tsx. Several keys can be selected (useKeySelection.ts): the
// last one is the key the editor, the quick menu, copy and paste work on.
// While a status setup picks its keys (PickBanner.tsx) the canvas only selects,
// and only keys with an LED.

import { useEffect, useMemo, useRef, useState } from "react";

import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";

import { keyFace, specialKind } from "../keyface/keyFace";
import { PREFERENCES, usePreference } from "../preferences";
import { useFaceContext } from "../keyface/useFaceContext";
import { keyAddressLabel } from "../key-address";

import { encoderPendingId, isDrafted, keyPendingId, lightingBaseFor, lightingDraftFor, pointingDraftDirty } from "../../workbench";
import { useWorkbench } from "../state";
import { stagedBetween } from "../../model/lighting/compare";

import { effectAnim, effectColor } from "../lighting/decor";
import { isDark } from "../../model/lighting/effect";
import { targetPreviewEffects } from "../../model/lighting/preview";
import { RowMenu, type MenuEntry } from "../RowMenu";
import { KeyHoverCard } from "./KeyHoverCard";
import { CanvasPill } from "./CanvasPill";
import { CarriedKey } from "./CarriedKey";
import { useKeyMoves } from "./useKeyMoves";
import { useKeySelection } from "./useKeySelection";
import { PickBanner } from "./PickBanner";
import { useKeyPick } from "../lighting/keyPick";
import { pickTakes } from "../../model/lighting/key-pick";
import { selectionShowing } from "../../model/key-selection";
import { useLightView } from "./lightView";
import { LightsButton } from "./LightsButton";
import { beginStroke } from "../draft/useHistory";
import { shownColor, type KeyLight } from "../../model/lighting/key-light";
import { useKeyLights } from "./useKeyLights";
import { cssEmissiveRgb } from "../../model/lighting/color";
import { useKeyClipboard } from "./useKeyClipboard";
import {
  activePointingDevices,
  activePointingOverrides,
  pointingModeKind,
} from "../../model/pointing";

import { useCapabilities } from "../use-capabilities";
import { useKeyText } from "../useKeyText";

export function KeymapCenter() {
  const keyText = useKeyText();
  const { bundle, state, dispatch, io } = useWorkbench();
  const face = useFaceContext();
  const highlightSpecial = usePreference(PREFERENCES.highlightSpecialKeys);
  const shiftedEverywhere = usePreference(PREFERENCES.shiftedCharacters) === "all";
  const capabilities = useCapabilities();
  const cols = bundle.caps.num_cols;
  const layer = state.layers[state.uiLayer];
  const layerLightingAvailable = capabilities.has("lighting.scenes") || capabilities.has("lighting.compiled");
  const [showLighting, setShowLighting] = useState(true);
  const moves = useKeyMoves();
  const { drag, keyboardMove } = moves;
  const [keyMenu, setKeyMenu] = useState<{ x: number; y: number; key: KeyView } | null>(null);
  const [hovered, setHovered] = useState<KeyView | null>(null);
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  });
  const pointingDevices = state.pointingDraft
    ? activePointingDevices(state.pointingDraft)
    : [];
  const pointingOverrides = state.pointingDraft
    ? activePointingOverrides(state.pointingDraft)
    : [];
  const pointingModeFor = (deviceId: number) =>
    pointingOverrides.find(
      (entry) => entry.layer === state.uiLayer && entry.device_id === deviceId,
    )?.mode ?? pointingDevices.find((entry) => entry.device_id === deviceId)?.mode;

  const runClipboard = useKeyClipboard(latestStateRef, moves.setMessage);

  // The layer's staged scene, previewed under the legends so bindings and
  // lighting can be judged together; the RGB Lighting tab paints it.
  const light = useLightView();
  const pick = useKeyPick();
  const chosen = useKeySelection(pick ? pickTakes(pick) : light.selecting ? "many" : null);

  const keyboardActivateKey = (key: KeyView, event: React.KeyboardEvent) => {
    if (event.key === "Escape") return moves.keyboardStep(key, event);
    if (chosen.activate(key, event)) return moves.cancelKeyboardMove();
    if (event.key === "Enter") dispatch({ type: "select", selection: { type: "key", row: key.row, col: key.col } });
    else moves.keyboardStep(key, event);
  };
  const lights = useKeyLights();
  // The lit board shows the layer's lighting whatever the switch says.
  const lit = light.open || (layerLightingAvailable && showLighting);
  // The compiled firmware cells are part of what the layer shows, so the
  // canvas previews the same composition the keyboard shows.
  const sceneEffects = useMemo(
    () =>
      lit
        ? targetPreviewEffects(
            state.uiLayer,
            lightingDraftFor(state, state.uiLayer),
            state.compiledScenes,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lit, state.compiledScenes, state.layerDrafts, state.scenes, state.uiLayer],
  );
  const sceneStaged = useMemo(
    () =>
      lit ? stagedBetween(lightingDraftFor(state, state.uiLayer), lightingBaseFor(state, state.uiLayer)) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lit, state.layerDrafts, state.scenes, state.uiLayer],
  );

  const decorFor = (key: KeyView): KeyDecor => {
    const action = layer?.[key.row * cols + key.col];
    const pending =
      state.pending[keyPendingId(state.uiLayer, key.row, key.col)];
    const stagedBinding = isDrafted(state, { kind: "key", layer: state.uiLayer, offset: key.row * cols + key.col });
    const scene =
      sceneEffects && key.ledId !== undefined ? sceneEffects.get(key.ledId) : undefined;
    // A light that is off (black) leaves the key as it is: its own face and special colour.
    const sceneEffect = scene && !isDark(scene) ? scene : undefined;
    const glyph = action !== undefined ? keyFace(action, state.morse, face) : { text: "" };
    // As in GLIDE: what Shift types shows on the base layer, or on every layer.
    if (!shiftedEverywhere && state.uiLayer !== 0) glyph.top = undefined;
    // A key with no binding at all shows the board's label.
    if (action === undefined && key.label) {
      glyph.text = key.label;
      glyph.dim = true;
    }
    const selected =
      state.selection?.type === "key" &&
      state.selection.row === key.row &&
      state.selection.col === key.col;
    const moveDestination = drag?.destination ?? keyboardMove?.destination;
    const dropTarget =
      moveDestination?.row === key.row && moveDestination.col === key.col;
    const source = drag?.source ?? keyboardMove?.source;
    const lifted = source?.row === key.row && source.col === key.col;
    const keyboardMoveHint = keyboardMove
      ? lifted
        ? " Picked up; press Space to put it back."
        : " Press Space to swap it with this key."
      : " Press Space to pick it up and swap it with another key.";
    const among = chosen.count > 1 && chosen.has(key);
    return {
      glyph,
      ariaLabel: `${keyText.layer(state.uiLayer)}, row ${key.row}, column ${key.col}: ${
        action === undefined ? "unavailable" : keyText.describe(action)
      }.${among ? ` Selected with ${chosen.count - 1} more.` : ""}${keyboardMoveHint}`,
      ariaKeyShortcuts: `Enter Space Escape Control+Enter Meta+Enter Shift+Enter${selected ? " Control+C Meta+C Control+V Meta+V" : ""}`,
      selected,
      inSelection: among && !selected,
      disabled: pick !== null && key.ledId === undefined,
      highlight: dropTarget,
      lifted,
      special: highlightSpecial && action !== undefined ? specialKind(action, face) : undefined,
      pending: pending?.status === "pending",
      error: pending?.status === "error",
      ...(light.open
        ? {
            lit: litKey(key),
          }
        : { fill: sceneEffect ? effectColor(sceneEffect) : undefined, fillAnim: sceneEffect ? effectAnim(sceneEffect) : undefined }),
      staged:
        stagedBinding ||
        (key.ledId !== undefined && (sceneStaged?.has(key.ledId) ?? false)),
    };
  };

  /** Paint gives a key the RGB Lighting tab's light, on the layer shown; a stroke is one undo step. */
  const paintKey = (key: KeyView, brush: KeyLight) => {
    if (key.ledId !== undefined) lights.paint(brush, key.ledId);
  };

  /** A key on the lit board: its LED's colour (a lock light lit, a battery above its level) and effect. */
  function litKey(key: KeyView): KeyDecor["lit"] {
    if (key.ledId === undefined) return {};
    const shown = lights.lightOf(key.ledId);
    const color = shownColor(shown);
    const effect = lights.preview.get(key.ledId);
    return { led: color ? cssEmissiveRgb(color) : undefined, anim: shown.kind === "color" && effect ? effectAnim(effect) : undefined };
  }

  // The key's quick menu, as in GLIDE: what it is, then copy, paste and clear.
  const keyMenuItems = (key: KeyView): MenuEntry[] => {
    const bound = layer?.[key.row * cols + key.col] ?? "No";
    return [
      { heading: `${keyAddressLabel(key)} · ${keyText.describe(bound)}` },
      { id: "copy", label: "Copy key", hint: "Ctrl/⌘ C" },
      { id: "paste", label: "Paste", hint: "Ctrl/⌘ V" },
      "-",
      {
        id: "transparent",
        label: "Same as layer below",
        disabled: bound === "Transparent",
        reason: "It already is",
      },
      { id: "clear", label: "Clear key", danger: true, disabled: bound === "No", reason: "It does nothing already" },
    ];
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col max-lg:min-h-[380px]">
      <BoardWell
        model={bundle.model}
        flush
        top={pick ? <PickBanner pick={pick} /> : <CanvasPill message={moves.status() ?? moves.message} />}
        tools={
          <>
            {hovered && !drag && <KeyHoverCard keyView={hovered} />}
            <LightsButton shown={layerLightingAvailable ? showLighting : undefined} onShown={setShowLighting} />
          </>
        }
      >
        <KeyboardCanvas
          model={bundle.model}
          className="h-full w-full"
          decorFor={decorFor}
          encoderDecorFor={(enc) => ({
            selected:
              state.selection?.type === "encoder" &&
              state.selection.id === enc.id,
            staged: isDrafted(state, { kind: "encoder", layer: state.uiLayer, id: enc.id }),
            pending:
              state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status ===
              "pending",
            error:
              state.pending[encoderPendingId(state.uiLayer, enc.id)]?.status ===
              "error",
          })}
          pointingDeviceDecorFor={(device) => {
            const mode = pointingModeFor(device.id);
            return {
              selected:
                state.selection?.type === "pointing" &&
                state.selection.id === device.id,
              staged: pointingDraftDirty(state),
              mode: mode ? pointingModeKind(mode) : "Unavailable",
            };
          }}
          onKeyContextMenu={(key, event) => {
            if (pick) return;
            dispatch({ type: "select", selection: selectionShowing(state.selection, key) });
            // From the keyboard (the menu key, Shift+F10) there is no pointer: open by the key.
            const fromKeyboard = event.clientX === 0 && event.clientY === 0;
            const box = (event.currentTarget as Element).getBoundingClientRect();
            setKeyMenu(
              fromKeyboard ? { x: box.left, y: box.bottom + 4, key } : { x: event.clientX, y: event.clientY, key },
            );
          }}
          onKeyHover={setHovered}
          onKeyPointerDown={(key, event) => {
            moves.cancelKeyboardMove();
            // Any other button opens the quick menu, which selects for itself.
            if (chosen.press(key, event) || event.button !== 0) return;
            if (light.brush) {
              beginStroke(dispatch);
              paintKey(key, light.brush);
            } else dispatch({ type: "select", selection: { type: "key", row: key.row, col: key.col } });
          }}
          onKeyPointerEnter={(key, event) => {
            if (!(event.buttons & 1) || chosen.cross(key)) return;
            if (light.brush) paintKey(key, light.brush);
          }}
          onKeyKeyboardActivate={keyboardActivateKey}
          onKeyFocus={moves.keyboardFocus}
          onKeyDragChange={moves.dragChange}
          keyDraggable={(key) =>
            !light.brush && !chosen.dragSelects() && state.pending[keyPendingId(state.uiLayer, key.row, key.col)]?.status !== "pending"
          }
          onKeyDrop={moves.dragDrop}
          onEncoderPointerDown={(enc) => {
            if (!pick) dispatch({ type: "select", selection: { type: "encoder", id: enc.id } });
          }}
          onPointingDeviceActivate={(device) => {
            if (!pick) dispatch({ type: "select", selection: { type: "pointing", id: device.id } });
          }}
          onBackgroundPointerDown={() => {
            moves.cancelKeyboardMove();
            dispatch({ type: "select", selection: null });
          }}
        />
      </BoardWell>
      {drag && moves.carry && (
        <CarriedKey
          carry={moves.carry}
          glyph={keyFace(layer?.[drag.source.row * cols + drag.source.col] ?? "No", state.morse, face)}
          over={drag.destination !== null}
        />
      )}
      {keyMenu && (
        <RowMenu
          x={keyMenu.x}
          y={keyMenu.y}
          label={`Key ${keyAddressLabel(keyMenu.key)}`}
          items={keyMenuItems(keyMenu.key)}
          onClose={() => setKeyMenu(null)}
          onAction={(id) => {
            const target = keyMenu.key;
            const selection = { type: "key" as const, row: target.row, col: target.col };
            if (id === "copy" || id === "paste") runClipboard(id, selection);
            else if (id === "transparent") void io.setKey(state.uiLayer, target.row, target.col, "Transparent");
            else if (id === "clear") void io.setKey(state.uiLayer, target.row, target.col, "No");
          }}
        />
      )}
    </div>
  );
}

