import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  MorseHoldTriggerPosition,
  MorseMode,
  MorseProfile,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { Button, Chip, Panel, SectionLabel, TextInput } from "../kit";
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

const DEFAULT_PROFILE = 255;

type MatrixPosition = Pick<MorseHoldTriggerPosition, "row" | "col">;

function positionKey(position: MatrixPosition): string {
  return `${position.row},${position.col}`;
}

function HoldTriggerPositionsPanel() {
  const { bundle, state, io } = useWorkbench();
  const capacity = state.morseHoldTriggerPositionCapacity;
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const saved = useMemo(
    () =>
      state.morseHoldTriggerPositions
        .filter((position) => position.profile === profile)
        .map(({ row, col }) => ({ row, col })),
    [profile, state.morseHoldTriggerPositions],
  );
  const [draft, setDraft] = useState<MatrixPosition[]>(saved);

  useEffect(() => setDraft(saved), [saved]);

  const selected = useMemo(() => new Set(draft.map(positionKey)), [draft]);
  const otherCount = state.morseHoldTriggerPositions.length - saved.length;
  const full = capacity !== null && otherCount + draft.length >= capacity;
  const dirty = !same(saved, draft);
  const pending = state.pending.morseHoldTriggerPositions;

  const toggle = useCallback(
    (key: KeyView) => {
      const id = positionKey(key);
      setDraft((current) => {
        if (current.some((position) => positionKey(position) === id)) {
          return current.filter((position) => positionKey(position) !== id);
        }
        if (capacity === null || otherCount + current.length >= capacity) return current;
        return [...current, { row: key.row, col: key.col }];
      });
    },
    [capacity, otherCount],
  );

  const decorFor = useCallback(
    (key: KeyView): KeyDecor => ({
      glyph: key.label ? { text: key.label, dim: true } : undefined,
      inSelection: selected.has(positionKey(key)),
    }),
    [selected],
  );

  if (capacity === null) {
    return (
      <Panel className="p-5">
        <SectionLabel>Positional hold triggers</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
          This firmware does not expose runtime hold-trigger positions.
        </p>
      </Panel>
    );
  }

  const apply = () => {
    const positions = state.morseHoldTriggerPositions
      .filter((position) => position.profile !== profile)
      .concat(draft.map(({ row, col }) => ({ profile, row, col })));
    io.setMorseHoldTriggerPositions(positions);
  };

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Positional hold triggers</SectionLabel>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-faint">
            Select the keys allowed to turn a pending tap-hold into a hold. A profile with no
            entries inherits the global default; an empty global default allows every key.
          </p>
        </div>
        <Chip tone={full ? "accent" : "neutral"} className="tnum">
          {otherCount + draft.length} / {capacity} entries
        </Chip>
      </div>

      <label className="mt-4 flex items-center justify-between gap-4 text-[13px] text-ink">
        Position list
        <select
          value={profile}
          onChange={(event) => setProfile(Number(event.target.value))}
          className="rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
        >
          <option value={DEFAULT_PROFILE}>Global default</option>
          {state.morseProfiles.map((_, index) => (
            <option key={index} value={index}>Profile {index}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 h-[390px] min-h-[260px]">
        <BoardWell model={bundle.model}>
          <KeyboardCanvas
            model={bundle.model}
            className="h-full w-full"
            decorFor={decorFor}
            onKeyPointerDown={toggle}
          />
        </BoardWell>
      </div>

      <div className="mt-2 text-[11.5px] text-faint">
        {draft.length === 0
          ? profile === DEFAULT_PROFILE
            ? "No global restriction: any key may trigger a hold."
            : "No profile-specific list: this profile inherits the global default."
          : `${draft.length} key${draft.length === 1 ? "" : "s"} selected for this list.`}
      </div>
      {pending?.status === "error" && (
        <div className="mt-3 text-[12px] text-danger">Write failed: {pending.message}</div>
      )}
      <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
        <Button
          variant="primary"
          disabled={!dirty || pending?.status === "pending"}
          onClick={apply}
        >
          {pending?.status === "pending" ? "Writing…" : "Save positions"}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
          Reset
        </Button>
      </div>
    </Panel>
  );
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
        <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-8">
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
          <HoldTriggerPositionsPanel />
        </div>
      </div>
    </div>
  );
}
