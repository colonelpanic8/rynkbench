import type { BoardDocumentTools } from "../model/boards/profile";
import { detectFormat, initConfigWasm, loadCatalog, snapshotFromState } from "./document";
import { exportDocument, importDocument } from "./transfer";
import { migrationDraft } from "./migration";

const moergo = {
  initialize: initConfigWasm,
  detectFormat,
  loadCatalog,
  snapshotFromState,
  importDocument,
  exportDocument,
  migrationDraft,
};

export type DocumentAdapter = typeof moergo;

const ADAPTERS: Record<BoardDocumentTools["codec"], DocumentAdapter> = { moergo };

export function documentAdapterFor(tools: BoardDocumentTools | undefined): DocumentAdapter | undefined {
  return tools ? ADAPTERS[tools.codec] : undefined;
}
