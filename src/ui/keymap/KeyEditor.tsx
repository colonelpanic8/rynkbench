// The key editor, below the keyboard, as in GLIDE (in EditorPanel's frame).
// Left: which key it is and its actions as slots (On Tap; On Hold, a tap-hold;
// On Double Tap, a morse entry of its own, written by model/key-slots' plan).
// The tabs fill the active slot: Pick Key, Switch Layer, Lighting, and Every
// action (the full editor, for macros, morse patterns and the rest). With
// several keys selected it edits the last one; only RGB Lighting reaches all.

import { useEffect, useMemo, useState } from "react";
import type { Action, KeyAction } from "../../model/action-types";

import { keyFace } from "../keyface/keyFace";
import { useFaceContext } from "../keyface/useFaceContext";
import { keyAddressLabel, keyPlaceName } from "../key-address";
import { isDrafted, keyPendingId } from "../../workbench";
import { useWorkbench } from "../state";
import { useCapabilities } from "../use-capabilities";
import { selectedKeys } from "../../model/key-selection";

import { WarningIcon } from "../icons";
import { showToast } from "../messages/store";
import {
  morseUses,
  planSlotWrites,
  putSlot,
  swapSlots,
  slotsOf,
  withProfile,
  type Slot,
  type SlotValues,
} from "../../model/key-slots";

import { ActionEditor } from "./ActionEditor";
import { EditorHeading, EditorPanel, EditorPlaceholder } from "./EditorPanel";
import { useEditorTabs, type EditorTab } from "./editorTabs";
import { LayerLighting } from "./LayerLighting";

import { PickKey } from "./PickKey";
import { SlotList } from "./SlotList";
import { SwitchLayer, type LayerKind } from "./SwitchLayer";
import { useKeyText } from "../useKeyText";

export function KeyEditor({ size = 310 }: { size?: number }) {
  const keyText = useKeyText();
  const { bundle, state, dispatch, io } = useWorkbench();
  const faceContext = useFaceContext();
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<EditorTab>("pick");
  const [slot, setSlot] = useState<Slot>("tap");
  const selection = state.selection?.type === "key" ? state.selection : null;
  const selectionId = selection ? `${state.uiLayer}:${selection.row}:${selection.col}` : null;
  useEffect(() => setSlot("tap"), [selectionId]);
  const uses = useMemo(() => morseUses(state.layers), [state.layers]);

  const tabs = useEditorTabs(true);

  if (!selection) {
    return <EditorPlaceholder size={size}>↑ Click a key on the keyboard to change what it does</EditorPlaceholder>;
  }

  const { row, col } = selection;
  const cols = bundle.caps.num_cols;
  const layer = state.uiLayer;
  const action: KeyAction = state.layers[layer]?.[row * cols + col] ?? "No";
  const pending = state.pending[keyPendingId(layer, row, col)];
  const staged = isDrafted(state, { kind: "key", layer, offset: row * cols + col });
  const key = bundle.model.keys.find((candidate) => candidate.row === row && candidate.col === col);
  const addressable = key ?? { row, col };
  const slots = slotsOf(action, state.morse);
  const commit = (next: KeyAction) => io.setKey(layer, row, col, next);
  /** Writes the morse entry (when the plan has one) before the key, and stops at the first failure. */
  const apply = async (next: SlotValues | "Transparent") => {
    const writes = planSlotWrites(action, next, state.morse, uses);
    if (!writes) {
      showToast("No double tap added: every morse entry is in use", {
        tone: "danger",
      });
      return;
    }
    for (const write of writes) {
      const result =
        write.kind === "morse" ? await io.setSlot("morse", write.index, write.entry) : await commit(write.binding);
      if (!result.ok) return;
    }
  };
  const put = (target: Slot, value: Action | null) => apply(putSlot(slots, target, value));
  const fill = (value: Action | "Transparent") => (value === "Transparent" ? apply("Transparent") : put(slot, value));
  const pickLayer = (kind: LayerKind, target: number) => {
    if (kind === "HoldTap") {
      void put("hold", { LayerOn: target } as Action);
      setSlot("tap");
      setTab("pick");
      return;
    }
    void fill({ [kind]: target } as unknown as Action);
  };
  const glyph = keyFace(action, state.morse, faceContext);
  const others = selectedKeys(selection).length - 1;

  const side = (
    <>
      <EditorHeading
        glyph={glyph}
        title={keyPlaceName(addressable)}
        detail={`Key ${keyAddressLabel(addressable).replace("-", " ")}${others > 0 ? ` · and ${others} more for RGB Lighting` : ""}`}
        onDone={() => dispatch({ type: "select", selection: null })}
        doneLabel="Done with this key"
      />

      {slots.kind === "slots" ? (
        <SlotList
          slots={slots}
          active={slot}
          offerDoubleTap={capabilities.has("keys.doubleTap")}
          profiles={state.morseProfiles}
          onSelect={setSlot}
          onSwap={(from, to) => {
            const next = swapSlots(slots, from, to);
            if (next === null) return;
            void apply(next);
            setSlot(to);
          }}
          onClear={(target) => {
            if (target !== "tap") setSlot("tap");
            void put(target, null);
          }}
          onProfile={(profile) => commit(withProfile(action, profile))}
        />
      ) : (
        <p className="text-body leading-relaxed text-mute">
          {slots.kind === "transparent"
            ? "Same as the layer below. Pick an action to give this key its own."
            : slots.kind === "morse"
              ? `${keyText.describe(action)}. Edit it under Behaviors → Morse, or pick an action to replace it.`
              : `${keyText.describe(action)}. Edit it under Every action, or pick an action to replace it.`}
        </p>
      )}

      {pending?.status === "pending" && <p className="text-small text-accent">Writing to the keyboard…</p>}
      {staged && <p className="text-small text-accent">Staged: written when the batch is applied</p>}
      {pending?.status === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-dim/25 px-3 py-2 text-body text-danger">
          <WarningIcon size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div>Not written: {pending.message}</div>
            <div className="mt-1 flex gap-3">
              {pending.attempted && (
                <button
                  type="button"
                  className="cursor-pointer font-semibold underline"
                  onClick={() => commit(pending.attempted!)}
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                className="cursor-pointer text-mute underline"
                onClick={() => dispatch({ type: "keyErrDismiss", layer, row, col })}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <EditorPanel size={size} side={side} tabs={tabs} tab={tab} onTab={setTab}>
      {tab === "pick" && <PickKey onPick={fill} disabled={false} />}
      {tab === "layer" && <SwitchLayer onPick={pickLayer} disabled={false} />}
      {tab === "lighting" && <LayerLighting ledId={key?.ledId} />}
      {tab === "all" && (
        <ActionEditor
          current={action}
          numLayers={bundle.caps.num_layers}
          onCommit={commit}
          lightingKey={key && { layer, key }}
        />
      )}
    </EditorPanel>
  );
}
