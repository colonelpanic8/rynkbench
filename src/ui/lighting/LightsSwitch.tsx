// The keyboard's lights on or off, on their own: RGB Effects shows it above the
// effects (RGB Lighting has it with brightness and background, BackgroundPanel).
// Staged until Apply, which writes the lighting state with only this changed;
// nothing is written while you switch.

import { useMemo } from "react";
import { useWorkbench } from "../state";
import { useDeviceDraft } from "../device-draft";
import { ApplyBar } from "../kit";
import { BigSwitch } from "../properties/BigSwitch";

export function LightsSwitch() {
  const { state, io } = useWorkbench();
  const device = state.lightingState;
  const stored = useMemo(() => (device === null ? null : { on: device.output_enabled }), [device]);
  const { draft, setDraft, dirty, reset } = useDeviceDraft(stored);
  if (!device || !draft) return null;

  return (
    <div className="flex flex-col gap-2">
      <BigSwitch
        name="Lights"
        state={draft.on ? "On" : "Off: the keyboard stays dark"}
        on={draft.on}
        onChange={(on) => setDraft({ on })}
      />
      {!draft.on && state.lightingOutputMode?.wake_layers ? (
        <p className="text-small leading-relaxed text-warn">A wake layer still turns the lights on while it is active.</p>
      ) : null}
      {dirty && (
        <ApplyBar
          compact
          apply={{
            label: "Apply",
            disabled: state.lightingBusy,
            onClick: () =>
              io.setLightingState({
                output_enabled: draft.on,
                output_brightness: device.output_brightness,
                background: { ...device.background },
              }),
          }}
          discard={{ label: "Revert", onClick: reset }}
        />
      )}
    </div>
  );
}
