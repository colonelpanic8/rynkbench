// An editor's Apply (ADR 0020): one operation, a new behavior in the first
// free slot or this one set with its name; says so, and why when it cannot.

import { useWorkbench } from "../../state";
import { useWording } from "../../terms";
import { showToast } from "../../messages/store";
import type { AnyBehavior, BehaviorValues } from "../../../operations";
import { LIBRARY_KINDS, type LibraryKind } from "../library";

export function useApply<K extends LibraryKind>(kind: K, slot: number | null) {
  const { io } = useWorkbench();
  const one = LIBRARY_KINDS[kind].one[useWording()];
  return async (value: BehaviorValues[K], name: string): Promise<boolean> => {
    const behavior = { kind, value } as AnyBehavior;
    const done =
      slot === null ? await io.apply("create_behavior", { ...behavior, name }) : await io.apply("set_behavior", { ...behavior, slot, name });
    showToast(done.ok ? `${one} saved` : `${one} not saved: ${done.message}`, { tone: done.ok ? "ok" : "danger" });
    return done.ok;
  };
}
