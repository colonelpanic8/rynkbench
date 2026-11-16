// The tap-hold profile editor in the editor shell (ADR 0020): its name, kept
// on the keyboard, and its timing.

import { useState } from "react";
import type { MorseProfile } from "../../../model/action-types";
import { emptyMorseProfile } from "../../../model/slots";
import { same } from "../../../model/deep-equal";
import { PROFILE_NAME_MAX } from "../../../operations";
import { useWorkbench } from "../../state";
import { useTerms, useWording } from "../../terms";
import { morseProfileSummary } from "../../morse-profile";
import { LIBRARY_KINDS } from "../library";
import type { BehaviorFocus } from "../focus";
import { EditorShell } from "./EditorShell";
import { TimingFields } from "./TimingFields";
import { useApply } from "./useApply";

/** Why a profile cannot be applied with this name, or null. */
export function profileNameProblem(name: string, others: readonly string[]): string | null {
  const wanted = name.trim();
  if (!wanted) return "A profile needs a name";
  if (wanted.length > PROFILE_NAME_MAX) return `A profile's name has at most ${PROFILE_NAME_MAX} characters`;
  return others.some((other) => other.toLowerCase() === wanted.toLowerCase()) ? `Another profile is called ${wanted}` : null;
}

export function ProfileEditor({ focus, onClose }: { focus: BehaviorFocus; onClose: () => void }) {
  const { state } = useWorkbench();
  const wording = useWording();
  const term = useTerms();
  const slot = focus === "new" ? null : focus;
  const entry = slot === null ? undefined : state.morseProfiles.find((profile) => profile.index === slot);
  const original: MorseProfile = entry?.profile ?? emptyMorseProfile();
  const [draft, setDraft] = useState<MorseProfile>(() => structuredClone(original));
  const [name, setName] = useState(entry?.name ?? "");
  const apply = useApply("profiles", slot);
  const one = LIBRARY_KINDS.profiles.one[wording];
  const others = state.morseProfiles.filter((profile) => profile.index !== slot).map((profile) => profile.name);

  return (
    <EditorShell
      subtitle={slot === null ? `New ${one.toLowerCase()}` : `${one} ${slot}`}
      name={name}
      onName={setName}
      namePlaceholder="Name"
      cards={[{ id: "timing", title: term("morse.timing"), sub: morseProfileSummary(draft) }]}
      selected="timing"
      onSelect={() => {}}
      dirty={slot === null || name.trim() !== (entry?.name ?? "") || !same(draft, original)}
      problem={profileNameProblem(name, others)}
      onApply={() => apply(draft, name)}
      onClose={onClose}
    >
      <TimingFields value={draft} onChange={setDraft} />
    </EditorShell>
  );
}
