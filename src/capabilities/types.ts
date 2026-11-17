// A capability is one keyboard function the firmware may or may not have. The
// UI asks for it by id and gets the capability or `undefined`; it never learns
// about absence from a failed request.
//
// Only what a consumer reads today is described here. Further contract fields
// (durability, atomic replace, order that carries meaning, destructive) join a
// capability with the first code that needs them, not ahead of it
// (docs/adr/0002-capability-contract.md).

export type CapabilityId =
  | "lighting.state"
  | "lighting.scenes"
  | "lighting.rules"
  | "lighting.compiled"
  | "lighting.extension"
  | "lighting.output"
  /** Lights put on the keyboard at once and never stored (the overlay). */
  | "lighting.overlay"
  | "pointing"
  /** On Double Tap in the key editor; its slots are the morse table's. */
  | "keys.doubleTap"
  /** The Behavior Library's kinds (ADR 0020), each a table of numbered slots. */
  | "behaviors.macros"
  | "behaviors.morse"
  | "behaviors.forks"
  | "behaviors.profiles";

/** The capabilities that are tables with a fixed number of slots. */
export type TableCapabilityId =
  | "lighting.scenes"
  | "lighting.rules"
  | "keys.doubleTap"
  | "behaviors.macros"
  | "behaviors.morse"
  | "behaviors.forks"
  | "behaviors.profiles";

export interface Capability {
  id: CapabilityId;
  /** Slots the firmware reserves for this surface, when it has a table. */
  slots?: number;
  /** Bytes the slots share, when they share a buffer (macros). */
  bytes?: number;
  /** How far a change goes: live over the link, or only by rebuilding the firmware. */
  reach: "device" | "build";
  /** Whether the surface cannot be written at all. */
  readOnly: boolean;
}

/** A capability whose surface is a table: its slot count is always known. */
export type TableCapability = Capability & { slots: number };

/** What one connected keyboard offers. Absent means the firmware lacks it. */
export interface CapabilitySet {
  get(id: TableCapabilityId): TableCapability | undefined;
  get(id: CapabilityId): Capability | undefined;
  has(id: CapabilityId): boolean;
  list(): Capability[];
}
