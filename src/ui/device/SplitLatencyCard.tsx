// The volatile powered/battery BLE latency policy on a split central.

import { useEffect, useMemo, useState } from "react";
import type { SplitCentralLatencyState } from "../../vendor/rynk-wasm/rynk_wasm";
import { errorMessage, useWorkbench } from "../state";
import { useDeviceDraft } from "../device-draft";
import { SaveBar } from "../write-status";
import { Button, Chip, Panel, SectionLabel } from "../kit";

/** The three latency knobs as text, so a half-typed number stays editable. */
interface LatencyDraft {
  powered: string;
  battery: string;
  override: string;
}

function draftOf(state: SplitCentralLatencyState): LatencyDraft {
  return {
    powered: String(state.policy.powered),
    battery: String(state.policy.battery),
    override:
      state.policy.override_latency === undefined ? "" : String(state.policy.override_latency),
  };
}

export function SplitLatencyCard() {
  const { bundle } = useWorkbench();
  const session = bundle.session;
  const [deviceState, setDeviceState] = useState<SplitCentralLatencyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable identity: `useDeviceDraft` follows a device value by reference, so
  // rebuilding this object every render would clobber the draft on every one.
  const device = useMemo<LatencyDraft>(
    () => (deviceState ? draftOf(deviceState) : { powered: "0", battery: "1", override: "" }),
    [deviceState],
  );
  const { draft, setDraft, dirty, reset } = useDeviceDraft(device);

  useEffect(() => {
    let cancelled = false;
    session.device.splitCentralLatency().then(
      (next) => {
        if (!cancelled) setDeviceState(next);
      },
      () => {
        if (!cancelled) setSupported(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!supported || !deviceState) return null;

  const values = [draft.powered, draft.battery, ...(draft.override === "" ? [] : [draft.override])];
  const valid = values.every((value) => {
    const parsed = Number(value);
    return value !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 499;
  });

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      setDeviceState(
        await session.device.setSplitCentralLatency({
          powered: Number(draft.powered),
          battery: Number(draft.battery),
          override_latency: draft.override === "" ? undefined : Number(draft.override),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-24 rounded-md border border-line bg-cap px-2 py-1 text-right font-mono text-[12px] text-cap-ink outline-none focus:border-accent";

  const field = (key: keyof LatencyDraft, id: string, label: string, placeholder?: string) => (
    <>
      <label htmlFor={id} className="text-[12.5px] text-mute">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        type="number"
        min={0}
        max={499}
        placeholder={placeholder}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </>
  );

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Split link latency</SectionLabel>
        <Chip tone={deviceState.powered ? "ok" : "neutral"}>
          {deviceState.powered ? "USB powered" : "battery"} · effective {deviceState.effective}
        </Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        Maximum BLE connection events the central may skip while active. The runtime override is
        volatile; leave it blank to follow the current power source.
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        {field("powered", "latency-powered", "USB-powered default")}
        {field("battery", "latency-battery", "Battery default")}
        {field("override", "latency-override", "Runtime override", "auto")}
      </div>
      {!valid && (
        <p className="mt-2 text-[11.5px] text-danger">Use whole numbers from 0 through 499.</p>
      )}
      <SaveBar
        className="mt-3 flex items-center gap-2"
        dirty={dirty}
        writing={busy}
        saveDisabled={!valid}
        saveLabel="Apply policy"
        writingLabel="Saving…"
        onSave={save}
        onReset={reset}
      >
        {draft.override !== "" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setDraft({ ...draft, override: "" })}
          >
            Restore automatic
          </Button>
        )}
      </SaveBar>
      {error && <div className="mt-2 text-[12px] text-danger">Failed: {error}</div>}
    </Panel>
  );
}
