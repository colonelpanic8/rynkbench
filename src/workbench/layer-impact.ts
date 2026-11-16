// What stands in the way of deleting a layer, told before anything is read from
// the keyboard. The layer rewrite refuses to delete a layer something still
// refers to, but only after reading the whole keyboard, and it names just the
// first reference. The reference graph knows every one of them at once.

import { layerReferences, type SiteRef, type UsageInput } from "./usage";

type Source = Pick<UsageInput, "layers" | "cols" | "layerMetadata" | "combos" | "morse" | "forks">;

/** The places that still refer to a layer and so block deleting it. A key on the
 *  layer itself does not count: it goes away with the layer. Each place is
 *  listed once, however many references it holds. */
export function layerDeletionBlockers(source: Source, layer: number): SiteRef[] {
  const seen = new Set<string>();
  return layerReferences(source, layer).filter((site) => {
    if (site.target?.kind === "cell" && site.target.layer === layer) return false;
    if (seen.has(site.label)) return false;
    seen.add(site.label);
    return true;
  });
}

/** The refusal, in a line: how many places, which, and what to do. */
export function deletionBlockedMessage(layerName: string, blockers: SiteRef[], show = 3): string {
  const shown = blockers.slice(0, show).map((site) => site.label).join(", ");
  const more = blockers.length > show ? `, … ${blockers.length - show} more` : "";
  const places = blockers.length === 1 ? "place" : "places";
  return `${layerName} is still used by ${blockers.length} ${places}: ${shown}${more}. Change those first, then delete it.`;
}
