import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MorseMode,
  MorseProfile,
  MorseProfileEntry,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../model/keyboard";
import { BoardWell, KeyboardCanvas } from "./KeyboardCanvas";
import type { KeyDecor } from "./KeyboardCanvas";
import { Button, Chip, Panel, SectionLabel, TextInput, cx } from "./kit";
import {
  profilePositionCount,
  replaceProfilePositions,
  type MatrixPosition,
} from "./profiles";
import { useWorkbench } from "./state";

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
  { key: "opposite_hand_hold", label: "Hold only for opposite hand" },
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
const EMPTY_PROFILE: MorseProfile = {
  unilateral_tap: undefined,
  opposite_hand_hold: undefined,
  enable_flow_tap: undefined,
  mode: undefined,
  hold_timeout_ms: undefined,
  gap_timeout_ms: undefined,
  quick_tap_timeout_ms: undefined,
  retro_tap: undefined,
  prior_idle_time_ms: undefined,
  hold_trigger_on_release: undefined,
};

function positionKey(position: MatrixPosition): string {
  return `${position.row},${position.col}`;
}

function HoldTriggerPositionsPanel({
  profile,
  profileName,
}: {
  profile: number;
  profileName: string;
}) {
  const { bundle, state, io } = useWorkbench();
  const capacity = state.morseHoldTriggerPositionCapacity;
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
        <SectionLabel>Related keys</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
          This firmware does not expose runtime hold-trigger positions.
        </p>
      </Panel>
    );
  }

  const apply = () => {
    const positions = replaceProfilePositions(state.morseHoldTriggerPositions, profile, draft);
    io.setMorseHoldTriggerPositions(positions);
  };

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Positional hold triggers</SectionLabel>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-faint">
            Select keys on the keyboard that may turn a pending tap-hold using {profileName} into
            a hold. A profile with no selections inherits the board default; an empty board
            default allows every key.
          </p>
        </div>
        <Chip tone={full ? "accent" : "neutral"} className="tnum">
          {otherCount + draft.length} / {capacity} entries
        </Chip>
      </div>

      <div className="mt-4 flex h-[390px] min-h-[260px]">
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
            ? "No board-wide restriction: any key may trigger a hold."
            : `${profileName} currently inherits the board default.`
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

function lowestFreeIndex(entries: MorseProfileEntry[], capacity: number): number | null {
  const occupied = new Set(entries.map((entry) => entry.index));
  for (let index = 0; index < capacity; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
}

function ProfileEditor({ entry, isNew, onSaved, onDelete }: {
  entry: MorseProfileEntry;
  isNew: boolean;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const { state, io } = useWorkbench();
  const [draft, setDraft] = useState<MorseProfileEntry>(() => structuredClone(entry));
  const pending = state.pending[`morseProfile:${entry.index}`];
  const dirty = isNew || !same(entry, draft);
  const duplicateName = state.morseProfiles.some(
    (item) => item.index !== entry.index && item.name === draft.name.trim(),
  );
  const validName = draft.name.trim().length > 0 && !duplicateName;

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>{isNew ? "New tap-hold profile" : "Profile settings"}</SectionLabel>
          <p className="mt-1.5 text-[12px] text-faint">Stable slot {entry.index}</p>
        </div>
        {!isNew && (
          <Button
            variant="ghost"
            disabled={pending?.status === "pending"}
            onClick={() => {
              onDelete();
              io.deleteMorseProfile(entry.index);
            }}
          >
            Delete profile
          </Button>
        )}
      </div>
      <label className="mt-5 flex items-center justify-between gap-4 text-[13px]">
        <span className="text-ink">Name</span>
        <TextInput
          value={draft.name}
          maxLength={32}
          aria-invalid={!validName}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className="w-56"
        />
      </label>
      {!validName && (
        <div className="mt-2 text-right text-[11.5px] text-danger">
          {duplicateName ? "Profile names must be unique." : "Enter a profile name."}
        </div>
      )}
      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
              {NUMBER_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-ink">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <TextInput
                      type="number"
                      min={0}
                      placeholder="default"
                      value={(draft.profile[key] as number | undefined) ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          profile: { ...draft.profile, [key]: optionalNumber(event.target.value) },
                        })
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
                  value={draft.profile.mode ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      profile: {
                        ...draft.profile,
                        mode: (event.target.value || undefined) as MorseMode | undefined,
                      },
                    })
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
                    value={draft.profile[key] === undefined ? "" : String(draft.profile[key])}
                    onChange={(event) => {
                      const value =
                        event.target.value === "" ? undefined : event.target.value === "true";
                      const profile = { ...draft.profile, [key]: value };
                      // These policies describe mutually exclusive decisions.
                      // Enabling one clears the other rather than creating an
                      // invalid profile that cannot be represented on wire.
                      if (value === true && key === "unilateral_tap") {
                        profile.opposite_hand_hold = undefined;
                      } else if (value === true && key === "opposite_hand_hold") {
                        profile.unilateral_tap = undefined;
                      }
                      setDraft({ ...draft, profile });
                    }}
                    className="rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink"
                  >
                    <option value="">Global default</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
              ))}
      </div>
      {draft.profile.opposite_hand_hold === true && (
        <p className="mt-4 rounded-lg border border-line-soft bg-well px-3 py-2 text-[11.5px] leading-relaxed text-faint">
          Opposite-hand hold uses the keyboard&apos;s L/R/* geometry tags. The timeout arms the
          hold; a same-hand ordinary key still resolves this key as a tap, while an
          opposite-hand or bilateral key activates the hold.
        </p>
      )}
      {pending?.status === "error" && (
        <div className="mt-4 text-[12px] text-danger">Write failed: {pending.message}</div>
      )}
      <div className="mt-5 flex gap-2 border-t border-line-soft pt-4">
        <Button
          variant="primary"
          disabled={!dirty || !validName || pending?.status === "pending"}
          onClick={() => {
            io.setMorseProfile({ ...draft, name: draft.name.trim() });
            onSaved();
          }}
        >
          {pending?.status === "pending" ? "Writing…" : isNew ? "Create profile" : "Save profile"}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(structuredClone(entry))}>
          Reset
        </Button>
      </div>
    </Panel>
  );
}

type ProfileSelection =
  | { kind: "default" }
  | { kind: "saved"; index: number }
  | { kind: "new"; index: number };

export function ProfilesMode() {
  const { state } = useWorkbench();
  const firstIndex = state.morseProfiles[0]?.index ?? null;
  const [selection, setSelection] = useState<ProfileSelection>(
    firstIndex === null ? { kind: "default" } : { kind: "saved", index: firstIndex },
  );
  const selected =
    selection.kind === "saved"
      ? state.morseProfiles.find((entry) => entry.index === selection.index) ?? null
      : null;
  const activeSelection: ProfileSelection =
    selection.kind !== "saved" || selected
      ? selection
      : firstIndex === null
        ? { kind: "default" }
        : { kind: "saved", index: firstIndex };
  const freeIndex = lowestFreeIndex(state.morseProfiles, state.morseProfileCapacity);
  const editorEntry = activeSelection.kind === "new"
    ? {
        index: activeSelection.index,
        name: "",
        profile: EMPTY_PROFILE,
      }
    : activeSelection.kind === "saved"
      ? state.morseProfiles.find((entry) => entry.index === activeSelection.index) ?? null
      : null;
  const positionProfile =
    activeSelection.kind === "default"
      ? DEFAULT_PROFILE
      : activeSelection.kind === "saved"
        ? activeSelection.index
        : null;
  const positionProfileName =
    activeSelection.kind === "default" ? "the board default" : editorEntry?.name ?? "this profile";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div>
          <h1 className="text-[17px] font-semibold text-ink">Tap-hold profiles</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-faint">
            Tune reusable tap-hold decisions and choose their related keys directly on the
            keyboard. Profile slots stay stable when another profile is renamed or removed.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={freeIndex === null}
          onClick={() => freeIndex !== null && setSelection({ kind: "new", index: freeIndex })}
        >
          Add profile
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Panel className="flex min-h-[180px] flex-col overflow-hidden">
          <div className="border-b border-line-soft px-4 py-3">
            <SectionLabel>Profiles</SectionLabel>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <button
              type="button"
              aria-current={activeSelection.kind === "default" ? "page" : undefined}
              onClick={() => setSelection({ kind: "default" })}
              className={cx(
                "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors",
                activeSelection.kind === "default"
                  ? "bg-accent-dim/40 text-ink"
                  : "text-mute hover:bg-raised hover:text-ink",
              )}
            >
              <span>
                <span className="block text-[13px] font-medium">Board default</span>
                <span className="mt-0.5 block text-[10.5px] text-faint">Fallback related keys</span>
              </span>
              <Chip tone={activeSelection.kind === "default" ? "accent" : "neutral"} className="tnum">
                {profilePositionCount(state.morseHoldTriggerPositions, DEFAULT_PROFILE)}
              </Chip>
            </button>

            <div className="my-2 border-t border-line-soft" />
            {activeSelection.kind === "new" && (
              <button
                type="button"
                aria-current="page"
                className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-accent-dim/40 px-3 py-2.5 text-left text-ink"
              >
                <span>
                  <span className="block text-[13px] font-medium">New profile</span>
                  <span className="mt-0.5 block text-[10.5px] text-faint">
                    Slot {activeSelection.index}
                  </span>
                </span>
              </button>
            )}
            {state.morseProfiles.map((entry) => {
              const active =
                activeSelection.kind === "saved" && activeSelection.index === entry.index;
              return (
                <button
                  key={entry.index}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSelection({ kind: "saved", index: entry.index })}
                  className={cx(
                    "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-accent-dim/40 text-ink"
                      : "text-mute hover:bg-raised hover:text-ink",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{entry.name}</span>
                    <span className="mt-0.5 block text-[10.5px] text-faint">Slot {entry.index}</span>
                  </span>
                  <Chip tone={active ? "accent" : "neutral"} className="tnum">
                    {profilePositionCount(state.morseHoldTriggerPositions, entry.index)}
                  </Chip>
                </button>
              );
            })}
            {state.morseProfiles.length === 0 && activeSelection.kind !== "new" && (
              <div className="px-3 py-5 text-center text-[12px] leading-relaxed text-faint">
                No custom profiles yet.
              </div>
            )}
          </div>
          <div className="border-t border-line-soft px-4 py-3 text-[11px] text-faint">
            {state.morseProfiles.length} / {state.morseProfileCapacity} slots used
          </div>
        </Panel>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-8">
          {editorEntry && activeSelection.kind !== "default" && (
            <ProfileEditor
              key={`${activeSelection.kind}:${activeSelection.index}:${editorEntry.name}`}
              entry={editorEntry}
              isNew={activeSelection.kind === "new"}
              onSaved={() => setSelection({ kind: "saved", index: activeSelection.index })}
              onDelete={() => setSelection({ kind: "default" })}
            />
          )}
          {positionProfile !== null ? (
            <HoldTriggerPositionsPanel
              key={positionProfile}
              profile={positionProfile}
              profileName={positionProfileName}
            />
          ) : (
            <Panel className="p-5">
              <SectionLabel>Related keys</SectionLabel>
              <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
                Create the profile first, then choose its related keys on the keyboard layout.
              </p>
            </Panel>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
