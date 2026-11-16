// A draft kept from an earlier visit with this keyboard, offered back (by the
// status chip) until it is restored or forgotten.

import { useSyncExternalStore } from "react";
import { useWorkbench } from "../state";
import { restoreActions, type StoredDraft } from "../../workbench/draft/changes";

/** A draft kept from an earlier visit, offered back until restored or forgotten. */
let earlier: StoredDraft | null = null;
const listeners = new Set<() => void>();
export const setEarlier = (next: StoredDraft | null) => {
  earlier = next;
  for (const listener of listeners) listener();
};
export const earlierDraft = {
  get: () => earlier,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
export function useEarlierDraft(): StoredDraft | null {
  return useSyncExternalStore(earlierDraft.subscribe, earlierDraft.get, earlierDraft.get);
}

/** Puts a kept draft back on top of what the keyboard has now, then forgets the offer. */
export function useRestoreEarlier() {
  const { state, dispatch } = useWorkbench();
  return {
    restore(kept: StoredDraft) {
      for (const action of restoreActions(kept, state)) dispatch(action);
      setEarlier(null);
    },
    forget() {
      setEarlier(null);
    },
  };
}
