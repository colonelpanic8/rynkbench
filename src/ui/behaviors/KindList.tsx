// A behavior kind's section in the Behaviors area (ADR 0020): its rows, and
// Create, which opens the editor on a new one.

import { useWording } from "../terms";
import { Button } from "../kit";
import { PlusIcon } from "../icons";
import { CenterScroll } from "../advanced/bits";
import { useLibraryInput } from "./useLibrary";
import { useBehaviorKinds } from "./useBehaviorKinds";
import { useBehaviorActions } from "./useBehaviorActions";
import { BehaviorRows } from "./BehaviorRows";
import { LIBRARY_KINDS, libraryRows, type LibraryKind } from "./library";

export function KindList({ kind }: { kind: LibraryKind }) {
  const input = useLibraryInput();
  const wording = useWording();
  const { writable } = useBehaviorKinds();
  const actions = useBehaviorActions();
  const rows = libraryRows(kind, input);
  return (
    <CenterScroll>
      {writable(kind) && (
        <Button onClick={() => actions.open(kind, "new")} className="w-full border-dashed border-line-strong py-2.5 font-semibold text-mute hover:text-ink">
          <PlusIcon size={12} /> Create {LIBRARY_KINDS[kind].one[wording].toLowerCase()}
        </Button>
      )}
      {rows.length === 0 && <p className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-body text-faint">None created yet.</p>}
      <BehaviorRows rows={rows} />
    </CenterScroll>
  );
}
