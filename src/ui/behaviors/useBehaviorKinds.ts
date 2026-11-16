// Which behavior kinds this keyboard has, from its capabilities (ADR 0020),
// in the library's order, with whether new ones can be added.

import { useCapabilities } from "../use-capabilities";
import { LIBRARY_ORDER, type LibraryKind } from "./library";

export function useBehaviorKinds(): { kinds: LibraryKind[]; writable: (kind: LibraryKind) => boolean } {
  const capabilities = useCapabilities();
  const kinds = LIBRARY_ORDER.filter((kind) => capabilities.has(`behaviors.${kind}`));
  return { kinds, writable: (kind) => capabilities.get(`behaviors.${kind}`)?.readOnly === false };
}
