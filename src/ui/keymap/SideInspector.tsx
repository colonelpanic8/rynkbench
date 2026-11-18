// The side inspector on the keymap screen: trackpads, encoders, and the
// layer's pointing settings when nothing is selected. Keys are edited below
// the keyboard (KeyEditor.tsx).

import { useEffect, useState } from "react";
import type {
  EncoderAction,
  KeyAction,
} from "../../model/action-types";


import { encoderPendingId, isDrafted } from "../../workbench";
import { useWorkbench } from "../state";
import { ActionEditor } from "./ActionEditor";

import { LayerPointing } from "./LayerPointing";

import { layerName } from "../layer-names";

import { Button, SectionLabel, cx } from "../kit";

import { CloseIcon, SpinnerIcon } from "../icons";
import { useKeyText } from "../useKeyText";

function EncoderInspector({ id }: { id: number }) {
  const keyText = useKeyText();
  const { bundle, state, io } = useWorkbench();
  const layer = state.uiLayer;
  const encoder = state.encoders[`${layer}:${id}`];
  const pending = state.pending[encoderPendingId(layer, id)];
  const staged = isDrafted(state, { kind: "encoder", layer, id });
  const [slot, setSlot] = useState<"cw" | "ccw">("cw");

  useEffect(() => {
    io.loadEncoder(layer, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, id]);

  const current: EncoderAction = encoder ?? {
    clockwise: "No",
    counter_clockwise: "No",
  };
  const slotAction =
    slot === "cw" ? current.clockwise : current.counter_clockwise;

  const commit = (action: KeyAction) => {
    const next: EncoderAction =
      slot === "cw"
        ? { ...current, clockwise: action }
        : { ...current, counter_clockwise: action };
    io.setEncoder(layer, id, next);
  };

  const slotChip = (
    which: "cw" | "ccw",
    label: string,
    title: string,
    value: KeyAction,
  ) => (
    <button
      type="button"
      onClick={() => setSlot(which)}
      title={title}
      className={cx(
        "flex flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-colors duration-120",
        slot === which
          ? "border-accent bg-accent-dim/30"
          : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <span className="text-caption font-semibold uppercase tracking-wider text-faint">
        {label}
      </span>
      <span className="font-mono text-ui text-ink">
        {keyText.glyph(value).text || "unset"}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Encoder {id}</SectionLabel>
          <span className="font-mono text-small text-faint">
            layer {layer}
          </span>
        </div>
        {pending?.status === "pending" && (
          <div className="mt-1 text-small text-accent">
            Writing to device…
          </div>
        )}
        {staged && (
          <div className="mt-1 text-small text-accent">
            In the draft: goes to the keyboard when you send
          </div>
        )}
        {pending?.status === "error" && (
          <div className="mt-1 text-small text-danger">
            Write failed: {pending.message}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          {slotChip("cw", "CW ↻", "Clockwise", current.clockwise)}
          {slotChip(
            "ccw",
            "CCW ↺",
            "Counter-clockwise",
            current.counter_clockwise,
          )}
        </div>
      </div>
      <div className="flex h-[360px] shrink-0 flex-col">
        <ActionEditor
          key={`${layer}:${id}:${slot}`}
          current={slotAction}
          numLayers={bundle.caps.num_layers}
          onCommit={commit}
        />
      </div>
    </div>
  );
}

function PointingInspector({ id }: { id: number }) {
  const { bundle, state, io } = useWorkbench();
  const label =
    bundle.model.pointingDevices.find((device) => device.id === id)?.label ??
    `Pointing device ${id}`;
  const name = layerName(state.layerMetadata, state.uiLayer);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-small text-faint">{name}</span>
      </div>
      {state.pointingDraft ? (
        <LayerPointing selectedDeviceId={id} />
      ) : state.pointingError ? (
        // The read failed; that is not the same as the firmware saying it has
        // no pointing configuration, so offer the re-read rather than blaming
        // the board for a limitation it may not have.
        <div className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-body leading-relaxed text-warn">
          <span>Could not read this keyboard's pointing configuration: {state.pointingError}</span>
          <Button
            variant="ghost"
            className="self-start"
            disabled={state.pointingBusy}
            onClick={() => void io.reloadPointingConfig()}
          >
            {state.pointingBusy && <SpinnerIcon size={13} />} Retry read
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-body leading-relaxed text-warn">
          This firmware does not expose runtime pointing configuration, so this trackpad cannot be edited here.
        </div>
      )}
    </div>
  );
}

export function KeymapInspector() {
  const { state, dispatch } = useWorkbench();
  // Only a trackpad or an encoder opens this panel, as GLIDE's touchpad window;
  // keys and combos are edited below the keyboard (KeyEditor, ComboEditor).
  const selection = state.selection;
  if (selection?.type !== "encoder" && selection?.type !== "pointing") return null;

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 text-small text-faint transition-colors duration-120 hover:text-mute"
          onClick={() => dispatch({ type: "select", selection: null })}
        >
          <CloseIcon size={11} />
          Clear selection
        </button>
      </div>
      {selection.type === "encoder" ? <EncoderInspector id={selection.id} /> : <PointingInspector id={selection.id} />}
      {selection.type !== "pointing" && <LayerPointing />}
    </div>
  );
}
