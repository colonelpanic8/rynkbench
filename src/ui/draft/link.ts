// Whether the keyboard can be reached (ADR 0012). When the link is lost and
// cannot be restored, the workbench stays open in Draft: you keep editing, the
// draft is kept for this keyboard, and on reconnect Send checks what changed
// on the keyboard meanwhile. The app shell sets it; the status chip reads it.

import { useSyncExternalStore } from "react";

export interface LinkState {
  lost: boolean;
  /** Try to reach the keyboard again; absent when it cannot be offered. */
  reconnect?: () => void;
}

let link: LinkState = { lost: false };
const listeners = new Set<() => void>();

export function setLink(next: LinkState): void {
  link = next;
  for (const listener of listeners) listener();
}

export function getLink(): LinkState {
  return link;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLink(): LinkState {
  return useSyncExternalStore(subscribe, getLink, getLink);
}
