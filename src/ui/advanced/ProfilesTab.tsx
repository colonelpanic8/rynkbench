import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { MorseMode, MorseProfile } from "../../vendor/rynk-wasm/rynk_wasm";
import { Button, Panel, SectionLabel, TextInput } from "../kit";
import { morseProfileSummary } from "../morse-profile";
import { useWorkbench } from "../state";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const MODES: Array<MorseMode> = [
  "Normal",
  "PermissiveHold",
  "HoldOnOtherPress",
  "TapUnlessInterrupted",
];
const NUMBER_FIELDS: Array<{ key: keyof MorseProfile; label: string }> = [
  { key: "hold_timeout_ms", label: "Hold timeout" },
  { key: "gap_timeout_ms", label: "Gap timeout" },
  { key: "quick_tap_timeout_ms", label: "Quick-tap timeout" },
  { key: "prior_idle_time_ms", label: "Prior-idle time" },
];
const BOOL_FIELDS: Array<{ key: keyof MorseProfile; label: string }> = [
  { key: "unilateral_tap", label: "Unilateral tap" },
  { key: "enable_flow_tap", label: "Flow tap" },
  { key: "retro_tap", label: "Retro tap" },
  { key: "hold_trigger_on_release", label: "Hold trigger on release" },
];

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ProfilesTab({ nav }: { nav: ReactNode }) {
  const { state, io } = useWorkbench();
  const [index, setIndex] = useState(0);
  const saved = state.morseProfiles[index];
  const [draft, setDraft] = useState<MorseProfile | null>(saved ?? null);

  useEffect(() => setDraft(saved ?? null), [index, saved]);

  if (!saved || !draft) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {nav}
        <div className="mx-auto mt-8 text-[12.5px] text-faint">
          This firmware does not expose runtime morse profiles.
        </div>
      </div>
    );
  }

  const pending = state.pending[`morseProfile:${index}`];
  const dirty = !same(saved, draft);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {nav}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4 pb-8">
          <Panel className="p-5">
            <SectionLabel>Runtime morse profiles</SectionLabel>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
              MT, LT, and tap-hold bindings reference these reusable slots. TOML exports give
              them stable names such as profile_000; firmware stores the slot index.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 text-[13px] text-ink">
              Profile
              <select
                value={index}
                onChange={(event) => setIndex(Number(event.target.value))}
                className="rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
              >
                {state.morseProfiles.map((profile, profileIndex) => (
                  <option key={profileIndex} value={profileIndex}>
                    {profileIndex}: {morseProfileSummary(profile)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex flex-col gap-4">
              {NUMBER_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-ink">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <TextInput
                      type="number"
                      min={0}
                      placeholder="default"
                      value={(draft[key] as number | undefined) ?? ""}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: optionalNumber(event.target.value) })
                      }
                      className="w-28 text-right"
                    />
                    <span className="text-[11.5px] text-faint">ms</span>
                  </span>
                </label>
              ))}
              <label className="flex items-center justify-between gap-4 text-[13px]">
                <span className="text-ink">Decision mode</span>
                <select
                  value={draft.mode ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, mode: (event.target.value || undefined) as MorseMode | undefined })
                  }
                  className="rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
                >
                  <option value="">Global default</option>
                  {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
              {BOOL_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-ink">{label}</span>
                  <select
                    value={draft[key] === undefined ? "" : String(draft[key])}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]: event.target.value === "" ? undefined : event.target.value === "true",
                      })
                    }
                    className="rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
                  >
                    <option value="">Global default</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
              ))}
            </div>
            {pending?.status === "error" && (
              <div className="mt-4 text-[12px] text-danger">Write failed: {pending.message}</div>
            )}
            <div className="mt-5 flex gap-2 border-t border-line-soft pt-4">
              <Button
                variant="primary"
                disabled={!dirty || pending?.status === "pending"}
                onClick={() => io.setMorseProfile(index, { ...draft })}
              >
                {pending?.status === "pending" ? "Writing…" : "Save profile"}
              </Button>
              <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
                Reset
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
