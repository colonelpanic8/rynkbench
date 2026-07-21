// Static re-export of the per-board enrichment registry. Kept in its own
// module so the app can lazy-load it: until src/model/boards lands (built in
// parallel), the dynamic import of this file simply rejects and the UI
// renders without enrichment. The import itself is static and unguarded.

export { enrichmentFor } from "../model/boards";
