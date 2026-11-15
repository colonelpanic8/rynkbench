/** Structural equality for protocol values. They are plain JSON-shaped data
 *  produced by one serializer, so key order is stable and a string compare is
 *  both correct and the cheapest thing that is. */
export function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Structural equality for values built in different places (by Rynkbench,
 *  and read back from the keyboard): key order and unset fields do not
 *  matter; array order does. */
export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || canonicalJson(a) === canonicalJson(b);
}

/** JSON with every object's keys sorted and unset fields left out. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
