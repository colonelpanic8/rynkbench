// Tap timing, a tap pattern's own or a profile's: each field left empty
// follows the keyboard's defaults. RMK's words in the technical voice.

import type { MorseMode, MorseProfile } from "../../../model/action-types";
import { TextInput } from "../../kit";
import { MORSE_MODES } from "../../morse-profile";
import { useTerms, type TermId } from "../../terms";

type Millis = "hold_timeout_ms" | "gap_timeout_ms" | "prior_idle_time_ms";
type Switch = "unilateral_tap" | "enable_flow_tap" | "retro_tap" | "hold_trigger_on_release";

const SELECT = "rounded-lg border border-line bg-well px-2 py-1 text-body text-ink";
const ROW = "flex items-center justify-between gap-3 text-body text-mute";

export function TimingFields({ value, onChange }: { value: MorseProfile; onChange: (next: MorseProfile) => void }) {
  const term = useTerms();
  const millis = (label: TermId, key: Millis) => (
    <label className={ROW}>
      {term(label)}
      <span className="flex items-center gap-1.5">
        <TextInput
          type="number"
          min={50}
          max={5000}
          placeholder="default"
          value={value[key] ?? ""}
          onChange={(event) => onChange({ ...value, [key]: event.target.value === "" ? undefined : Number(event.target.value) })}
          className="w-24 text-right"
        />
        <span className="text-faint">ms</span>
      </span>
    </label>
  );
  const choice = (label: TermId, key: Switch) => (
    <label className={ROW}>
      {term(label)}
      <select
        value={value[key] === undefined ? "default" : value[key] ? "on" : "off"}
        onChange={(event) => onChange({ ...value, [key]: event.target.value === "default" ? undefined : event.target.value === "on" })}
        className={SELECT}
      >
        <option value="default">Default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      <label className={ROW}>
        {term("timing.mode")}
        <select
          value={value.mode ?? "default"}
          onChange={(event) => onChange({ ...value, mode: event.target.value === "default" ? undefined : (event.target.value as MorseMode) })}
          className={SELECT}
        >
          <option value="default">Default</option>
          {MORSE_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      {millis("timing.hold", "hold_timeout_ms")}
      {millis("timing.gap", "gap_timeout_ms")}
      {choice("timing.unilateral", "unilateral_tap")}
      {choice("timing.flow", "enable_flow_tap")}
      {millis("timing.idle", "prior_idle_time_ms")}
      {choice("timing.retro", "retro_tap")}
      {choice("timing.release", "hold_trigger_on_release")}
    </div>
  );
}
