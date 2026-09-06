import { useCallback, useState } from "react";
import { same } from "./deep-equal";

export interface DeviceDraft<T> {
  draft: T;
  setDraft: (next: T) => void;
  /** Whether the draft differs from what the device currently holds. */
  dirty: boolean;
  /** Throw the draft away and show the device's value again. */
  reset: () => void;
}

/**
 * A local draft of a device-owned value that follows device pushes only while
 * it is clean.
 *
 * Pending optimistic values are not a confirmed baseline for staged edits.
 */
export function useDeviceDraft<T>(device: T, pending = false): DeviceDraft<T> {
  const [state, setState] = useState(() => ({ draft: device, followed: device }));
  let current = state;
  if (!pending && !Object.is(state.followed, device)) {
    current = {
      draft: same(state.draft, state.followed) ? device : state.draft,
      followed: device,
    };
    setState(current);
  }
  const setDraft = useCallback((draft: T) => setState((prev) => ({ ...prev, draft })), []);
  return {
    draft: current.draft,
    setDraft,
    dirty: !same(current.draft, current.followed),
    reset: () => setDraft(current.followed),
  };
}
