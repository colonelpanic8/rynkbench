import type { ExtensionCatalog, ImportNote, RuntimeSnapshot } from "./document";
import { parseDocument, renderDocument } from "./document";
import {
  boardForSnapshot,
  GLOVE80_TRANSFER_MODEL,
  GO60_TRANSFER_MODEL,
  transferSnapshot,
} from "../model/boards/transfer";
import type { MoErgoBoard } from "../model/boards/transfer";

export interface MigrationDraft {
  text: string;
  target: MoErgoBoard;
  notes: ImportNote[];
}

/** Make a standalone peer-board document without carrying destination state. */
export function migrationDraft(source: RuntimeSnapshot, catalog: ExtensionCatalog): MigrationDraft {
  const board = boardForSnapshot(source);
  const target = board.id === "glove80" ? GO60_TRANSFER_MODEL : GLOVE80_TRANSFER_MODEL;
  const empty: RuntimeSnapshot = {
    ...source,
    rows: target.rows,
    cols: target.cols,
    layers: source.layers.map(() => Array.from(
      { length: target.rows * target.cols },
      (_, offset) => target.physical.has(`${Math.floor(offset / target.cols)},${offset % target.cols}`)
        ? "Transparent" as const : "No" as const,
    )),
    lighting: undefined,
    behaviors: undefined,
    pointing: undefined,
  };
  const result = transferSnapshot(source, target.rows, target.cols, empty);
  result.snapshot.bluetooth_name = undefined;
  const notes = [...result.notes];
  if (target.id === "glove80") {
    if (result.snapshot.pointing) {
      notes.push({ location: "Pointing", message: "Go60 trackpad settings are omitted on Glove80.", approximated: false });
      result.snapshot.pointing = undefined;
    }
    if (result.snapshot.behaviors?.auto_mouse_layers?.length) {
      notes.push({ location: "Auto-mouse layers", message: "Go60 automatic pointing layers are omitted on Glove80.", approximated: false });
      result.snapshot.behaviors.auto_mouse_layers = undefined;
    }
  }
  result.snapshot.behaviors ??= {
    config: undefined, options: undefined, morse_profiles: undefined,
    hold_trigger_positions: undefined, auto_mouse_layers: undefined,
    morses: undefined, combos: undefined, forks: undefined, macros: undefined,
  };
  const text = renderDocument(result.snapshot, catalog, "toml");
  parseDocument(text, catalog);
  return { text, target: target.id, notes };
}
