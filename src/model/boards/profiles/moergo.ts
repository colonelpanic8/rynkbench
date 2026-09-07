import type { BoardDocumentTools, BoardProfile } from "../profile";
import { glove80Enrichment } from "../glove80";
import { go60Enrichment } from "../go60";

const documentTools = (id: string, name: string): BoardDocumentTools => ({
  codec: "moergo",
  formats: ["toml", "moergo-json"],
  importHint: "Import a Glove80 or Go60 TOML, or MoErgo JSON; shared physical keys transfer between boards",
  migrationTarget: { id, name },
});

export const MOERGO_PROFILES: readonly BoardProfile[] = [
  {
    id: "glove80",
    name: "Glove80",
    identity: { vendorId: 0x16c0, productId: 0x27db, productName: "Glove80" },
    matrix: { rows: 6, cols: 14 },
    enrichment: glove80Enrichment,
    documents: documentTools("go60", "Go60"),
    presets: ["glove80-status", "glove80-stock-magic"],
    defaultStatusLayer: 2,
  },
  {
    id: "go60",
    name: "Go60",
    identity: { vendorId: 0x16c0, productId: 0x27db, productName: "Go60" },
    matrix: { rows: 5, cols: 14 },
    enrichment: go60Enrichment,
    documents: documentTools("glove80", "Glove80"),
    presets: [],
  },
];

