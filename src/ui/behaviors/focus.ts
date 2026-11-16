// Which behavior an editor opens on (ADR 0020).

/** A slot to open, or "new" to start a new one that Apply puts in the first free slot. */
export type BehaviorFocus = number | "new";
