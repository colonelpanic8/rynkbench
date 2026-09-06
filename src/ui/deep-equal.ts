/** Structural equality for protocol values. They are plain JSON-shaped data
 *  produced by one serializer, so key order is stable and a string compare is
 *  both correct and the cheapest thing that is. */
export function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
