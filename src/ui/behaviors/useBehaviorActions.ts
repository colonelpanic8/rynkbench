// What a behavior row can do, the same in the library lists and All your
// behaviors (ADR 0020): open it, rename it, copy, paste, delete (asking first
// when something still uses it) and delete the unused. Each change is an
// operation through `io.apply`.

import { useWorkbench } from "../state";
import { askConfirm, showToast } from "../messages/store";
import { labelAt } from "../../model/behavior-labels";
import { valueOf, type CopiedBehavior } from "../../operations";
import { wantOf } from "../../workbench/draft/want";
import type { SiteTarget } from "../../workbench/usage";
import { setBehaviorFocus, type BehaviorFocus } from "./focus";
import { setBehaviorClip, useBehaviorClip } from "./clip";
import { openBehaviorEditor, WINDOW_KINDS } from "./editor/store";
import { stillUsedText, type LibraryKind, type LibraryRow } from "./library";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function useBehaviorActions() {
  const { state, dispatch, io } = useWorkbench();
  const clip = useBehaviorClip();
  const report = (done: { ok: boolean; message?: string }, text: string) =>
    showToast(done.ok ? text : (done.message ?? "Nothing was changed"), { tone: done.ok ? "ok" : "danger" });

  /** Takes you to a place that uses a behavior: a key in the keymap, a combo, a fork. */
  const goTo = (target: SiteTarget | null) => {
    if (!target) return;
    if (target.kind === "cell") {
      dispatch({ type: "uiLayer", layer: target.layer });
      dispatch({ type: "select", selection: { type: "key", row: target.row, col: target.col } });
      dispatch({ type: "mode", mode: "keymap" });
    } else if (target.kind === "combo") {
      dispatch({ type: "mode", mode: "keymap" });
      dispatch({ type: "select", selection: { type: "combo", index: target.index } });
    } else {
      open("forks", target.index);
    }
  };

  const open = (kind: LibraryKind, focus: BehaviorFocus) => {
    if (WINDOW_KINDS.has(kind)) {
      openBehaviorEditor(kind, focus);
      return;
    }
    setBehaviorFocus(kind, focus);
    dispatch({ type: "mode", mode: kind });
  };

  const rename = async (row: LibraryRow, name: string, description?: string) => {
    const done = await io.apply("rename_behavior", { kind: row.kind, slot: row.index, name, description });
    if (!done.ok) showToast(`Not renamed: ${done.message}`, { tone: "danger" });
    return done.ok;
  };

  const copied = (rows: readonly LibraryRow[]): CopiedBehavior[] => {
    const image = wantOf(state);
    return rows.flatMap((row) => {
      const value = valueOf(image, row.kind, row.index);
      if (!value) return [];
      const name = row.named ? row.name : "";
      const description = labelAt(state.labels, row.kind, row.index)?.description ?? "";
      return [{ kind: row.kind, value, name, description } as CopiedBehavior];
    });
  };

  const copy = (rows: readonly LibraryRow[]) => {
    const kept = setBehaviorClip(copied(rows));
    showToast(`Copied ${count(kept.count, "behavior")}: Paste adds ${kept.count === 1 ? "it" : "them"} to any keyboard`, { tone: "ok" });
  };

  const paste = async () => {
    if (!clip) return;
    report(await io.apply("paste_behaviors", { text: clip.text }), `Pasted ${count(clip.count, "behavior")}`);
  };

  const remove = async (row: LibraryRow) => {
    if (row.uses) {
      const { title, body } = stillUsedText(row);
      const yes = await askConfirm({
        guard: true,
        title,
        body,
        details: row.places.map((place) => place.label),
        confirmLabel: "Delete anyway",
        cancelLabel: "Keep it",
        danger: true,
      });
      if (!yes) return;
    }
    report(await io.apply("delete_behavior", { kind: row.kind, slot: row.index }), `${row.name} deleted`);
  };

  const deleteUnused = async (rows: readonly LibraryRow[]) => {
    const unused = rows.filter((row) => row.use !== "used");
    if (unused.length === 0) return;
    const yes = await askConfirm({
      title: `Delete ${count(unused.length, "unused behavior")}?`,
      body: "Nothing uses them; Undo brings them back.",
      details: unused.map((row) => row.name),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!yes) return;
    const items = unused.map((row) => ({ kind: row.kind, slot: row.index }));
    report(await io.apply("delete_unused_behaviors", { items }), `${count(unused.length, "unused behavior")} deleted`);
  };

  return { clip, goTo, open, rename, copy, paste, remove, deleteUnused };
}
