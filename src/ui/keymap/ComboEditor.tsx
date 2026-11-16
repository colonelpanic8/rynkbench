// The panel below the keyboard while a combo is open in Focus Mode, as in
// GLIDE: the combo's action as slots (On Tap, On Hold) and the layer it works
// on; the tabs fill the active slot. Its keys are picked on the canvas.

import { useEffect, useState } from "react";
import type { Action, KeyAction } from "../../model/action-types";
import { comboLayer, comboOutput } from "../../model/combos";
import { planSlotWrites, putSlot, slotsOf, swapSlots, withProfile, type Slot } from "../../model/key-slots";

import { layerName } from "../layer-names";
import { SectionLabel } from "../kit";
import { useWorkbench } from "../state";
import { keyFace } from "../keyface/keyFace";
import { useFaceContext } from "../keyface/useFaceContext";
import { ActionEditor } from "./ActionEditor";
import { EditorHeading, EditorPanel } from "./EditorPanel";
import { useEditorTabs, type EditorTab } from "./editorTabs";
import { PickKey } from "./PickKey";
import { SlotList } from "./SlotList";
import { SwitchLayer, type LayerKind } from "./SwitchLayer";
import type { ComboFocus } from "./useComboFocus";
import { useKeyText } from "../useKeyText";

function LayerChoice({ focus }: { focus: ComboFocus }) {
  const { bundle, state } = useWorkbench();
  const own = comboLayer(focus.combo);
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>Works on</SectionLabel>
      <select
        value={own ?? ""}
        onChange={(event) => void focus.setLayer(event.target.value === "" ? undefined : Number(event.target.value))}
        className="rounded-lg border border-line bg-raised px-2 py-1.5 text-body text-ink"
      >
        <option value="">Every layer</option>
        {Array.from({ length: bundle.caps.num_layers }, (_, layer) => (
          <option key={layer} value={layer}>
            {layerName(state.layerMetadata, layer)} only
          </option>
        ))}
      </select>
    </label>
  );
}

export function ComboEditor({ focus, size }: { focus: ComboFocus; size: number }) {
  const keyText = useKeyText();
  const { bundle, state } = useWorkbench();
  const faceContext = useFaceContext();
  const tabs = useEditorTabs(false);
  const [tab, setTab] = useState<EditorTab>("pick");
  const [slot, setSlot] = useState<Slot>("tap");
  useEffect(() => setSlot("tap"), [focus.index]);

  const output = comboOutput(focus.combo);
  const slots = slotsOf(output);
  const put = (target: Slot, value: Action | null) => {
    // A combo's action is a plain binding: no morse entry, so the plan is at most one write.
    const [write] = planSlotWrites(output, putSlot(slots, target, value), [], new Map()) ?? [];
    if (write?.kind === "key") void focus.setOutput(write.binding);
  };
  const fill = (value: Action | "Transparent") =>
    value === "Transparent" ? void focus.setOutput("Transparent") : put(slot, value);
  const pickLayer = (kind: LayerKind, target: number) => {
    if (kind === "HoldTap") {
      put("hold", { LayerOn: target } as Action);
      setSlot("tap");
      return;
    }
    fill({ [kind]: target } as unknown as Action);
  };

  const side = (
    <>
      <EditorHeading
        glyph={keyFace(output, state.morse, faceContext)}
        title={`Combo C${focus.index}`}
        detail={`${focus.keys} of ${focus.maxKeys} keys pressed together`}
        onDone={focus.done}
        doneLabel="Done editing this combo"
      />
      {slots.kind === "slots" ? (
        <SlotList
          slots={slots}
          active={slot}
          offerDoubleTap={false}
          profiles={state.morseProfiles}
          onSelect={setSlot}
          onSwap={(from, to) => {
            const next = swapSlots(slots, from, to);
            const [write] = next ? (planSlotWrites(output, next, [], new Map()) ?? []) : [];
            if (write?.kind === "key") void focus.setOutput(write.binding);
            setSlot(to);
          }}
          onClear={(target) => {
            if (target !== "tap") setSlot("tap");
            put(target, null);
          }}
          onProfile={(profile) => void focus.setOutput(withProfile(output, profile))}
        />
      ) : (
        <p className="text-body leading-relaxed text-mute">
          {keyText.describe(output)}. Edit it under Every action, or pick an action to replace it.
        </p>
      )}
      <LayerChoice focus={focus} />
    </>
  );

  return (
    <EditorPanel size={size} side={side} tabs={tabs} tab={tab} onTab={setTab}>
      {tab === "pick" && <PickKey onPick={fill} disabled={false} />}
      {tab === "layer" && <SwitchLayer onPick={pickLayer} disabled={false} />}
      {tab === "all" && (
        <ActionEditor
          current={output}
          numLayers={bundle.caps.num_layers}
          onCommit={(next: KeyAction) => void focus.setOutput(next)}
        />
      )}
    </EditorPanel>
  );
}
