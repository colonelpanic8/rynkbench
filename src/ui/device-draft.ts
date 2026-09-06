import { useRef, useState } from "react";
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
 * The device value can move under the editor at any time — a topic push, a
 * rollback after a failed write, another panel's write. An untouched draft
 * should track it; staged edits must never be clobbered by it. Every panel
 * used to hand-roll this with a ref and an effect that lied about its deps.
 */
export function useDeviceDraft<T>(device: T): DeviceDraft<T> {
  const [draft, setDraft] = useState(device);
  // The device value this draft was last aligned with. Comparing against it
  // (not against `device`) is what tells "user edited" from "device moved".
  const followed = useRef(device);
  if (followed.current !== device) {
    const wasClean = same(draft, followed.current);
    followed.current = device;
    if (wasClean) setDraft(device);
  }
  return {
    draft,
    setDraft,
    dirty: !same(draft, device),
    reset: () => setDraft(device),
  };
}
