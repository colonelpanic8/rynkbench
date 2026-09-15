import type { BoardEnrichment } from "../keyboard";

export interface BoardDocumentTools {
  codec: "moergo";
  formats: readonly ("toml" | "moergo-json")[];
  importHint: string;
  migrationTarget?: { id: string; name: string };
}

export type BootloaderTarget =
  | { kind: "central" }
  | { kind: "peripheral"; slot: number };

/** A release service understood by the firmware updater. Additional source
 * kinds can be added without changing board detection or the installer. */
export interface FirmwareReleaseSource {
  kind: "github-latest-release";
  repository: string;
  label: string;
}

/** One independently flashable processor belonging to a board profile. */
export interface FirmwareTarget {
  id: string;
  label: string;
  /** Preferred-first release locations. An archive entry is verified only
   * after its containing release asset passes the release digest check. */
  locations: readonly {
    /** JavaScript regular-expression source matched against release asset names. */
    assetPattern: string;
    /** Optional regular-expression source selecting one file inside a ZIP asset. */
    archiveEntryPattern?: string;
  }[];
  /** UF2 family every block in the downloaded image must carry. */
  uf2FamilyId: number;
  bootloader: BootloaderTarget;
  /** Mounted UF2 volume names accepted for this processor. */
  volumeLabels: readonly string[];
}

export interface FirmwareUpdateProfile {
  source: FirmwareReleaseSource;
  targets: readonly FirmwareTarget[];
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
  /** Named board-reserved User actions that the key editor can bind safely. */
  userActions?: readonly {
    id: number;
    label: string;
    hint: string;
    danger?: boolean;
  }[];
  defaultStatusLayer?: number;
  /** Optional, declarative route from this device identity to trusted firmware. */
  firmware?: FirmwareUpdateProfile;
}
