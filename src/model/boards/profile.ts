import type { BoardEnrichment } from "../keyboard";

export interface BoardDocumentTools {
  codec: "moergo";
  formats: readonly ("toml" | "moergo-json")[];
  importHint: string;
  migrationTarget?: { id: string; name: string };
}

/** Optional product knowledge; protocol capabilities remain authoritative. */
export interface BoardProfile {
  id: string;
  name: string;
  identity: { vendorId: number; productId: number; productName: string };
  matrix: { rows: number; cols: number };
  enrichment: BoardEnrichment;
  documents?: BoardDocumentTools;
  presets: readonly string[];
  defaultStatusLayer?: number;
}

