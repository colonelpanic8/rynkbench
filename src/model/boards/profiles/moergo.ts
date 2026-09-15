import type { BoardDocumentTools, BoardProfile } from "../profile";
import { glove80Enrichment } from "../glove80";
import { go60Enrichment } from "../go60";

const documentTools = (id: string, name: string): BoardDocumentTools => ({
  codec: "moergo",
  formats: ["toml", "moergo-json"],
  importHint: "Import a Glove80 or Go60 TOML, or MoErgo JSON; shared physical keys transfer between boards",
  migrationTarget: { id, name },
});

const releaseSource = {
  kind: "github-latest-release" as const,
  repository: "colonelpanic8/moergo-config",
  label: "Rynkbench MoErgo releases",
};

const bleUserActions = [
  {
    id: 10,
    label: "Bluetooth · clear active / selected",
    hint: "Tap alone for the active profile; hold with a profile key to clear and activate that slot · U10",
    danger: true,
  },
  {
    id: 11,
    label: "Bluetooth · clear all profiles",
    hint: "Forget every host pairing while preserving split-half and dongle bonds · U11",
    danger: true,
  },
] as const;

export const MOERGO_PROFILES: readonly BoardProfile[] = [
  {
    id: "glove80",
    name: "Glove80",
    identity: { vendorId: 0x16c0, productId: 0x27db, productName: "Glove80" },
    matrix: { rows: 6, cols: 14 },
    enrichment: glove80Enrichment,
    documents: documentTools("go60", "Go60"),
    presets: ["glove80-status", "glove80-stock-magic"],
    userActions: bleUserActions,
    defaultStatusLayer: 2,
    firmware: {
      source: releaseSource,
      targets: [
        {
          id: "left",
          label: "Left / central half",
          locations: [{ assetPattern: "^glove80-rmk-.+-lh\\.uf2$" }],
          uf2FamilyId: 0x9807b007,
          bootloader: { kind: "central" },
          volumeLabels: ["GLV80LHBOOT"],
        },
        {
          id: "right",
          label: "Right / peripheral half",
          locations: [{ assetPattern: "^glove80-rmk-.+-rh\\.uf2$" }],
          uf2FamilyId: 0x9808b007,
          bootloader: { kind: "peripheral", slot: 0 },
          volumeLabels: ["GLV80RHBOOT"],
        },
      ],
    },
  },
  {
    id: "go60",
    name: "Go60",
    identity: { vendorId: 0x16c0, productId: 0x27db, productName: "Go60" },
    matrix: { rows: 5, cols: 14 },
    enrichment: go60Enrichment,
    documents: documentTools("glove80", "Glove80"),
    presets: [],
    userActions: bleUserActions,
    firmware: {
      source: releaseSource,
      targets: [
        {
          id: "left",
          label: "Left / central half",
          locations: [
            { assetPattern: "^go60-rmk-.+-lh\\.uf2$" },
            { assetPattern: "^go60-rmk\\.zip$", archiveEntryPattern: "^go60-rmk-.+-lh\\.uf2$" },
          ],
          uf2FamilyId: 0x9809b007,
          bootloader: { kind: "central" },
          volumeLabels: ["GO60LHBOOT"],
        },
        {
          id: "right",
          label: "Right / peripheral half",
          locations: [
            { assetPattern: "^go60-rmk-.+-rh\\.uf2$" },
            { assetPattern: "^go60-rmk\\.zip$", archiveEntryPattern: "^go60-rmk-.+-rh\\.uf2$" },
          ],
          uf2FamilyId: 0x980ab007,
          bootloader: { kind: "peripheral", slot: 0 },
          volumeLabels: ["GO60RHBOOT"],
        },
      ],
    },
  },
];
