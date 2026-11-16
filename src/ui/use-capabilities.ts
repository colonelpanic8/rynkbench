// How screens ask what the connected keyboard can do: by capability id, never
// by probing the firmware or testing a nullable field.

import { useMemo } from "react";
import { firmwareFactsOf, resolveCapabilities } from "../capabilities";
import type { Capability, CapabilityId, CapabilitySet, TableCapability, TableCapabilityId } from "../capabilities";
import { useWorkbench } from "./state";

/** The capabilities of the connected keyboard. They are resolved from what
 *  connecting found out, so they stay the same for the whole session. */
export function useCapabilities(): CapabilitySet {
  const { bundle } = useWorkbench();
  return useMemo(() => resolveCapabilities(firmwareFactsOf(bundle)), [bundle]);
}

/** One capability, or `undefined` when the firmware lacks it. A table
 *  capability comes with its slot count. */
export function useCapability(id: TableCapabilityId): TableCapability | undefined;
export function useCapability(id: CapabilityId): Capability | undefined;
export function useCapability(id: CapabilityId): Capability | undefined {
  return useCapabilities().get(id);
}
