import type { ImportNote, RuntimeSnapshot } from "../../config/document";
import type { KeyboardModel } from "../keyboard";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import {
  GLOVE80_BOARD_KEYS,
  GLOVE80_COLS,
  GLOVE80_GRID,
  GLOVE80_ROWS,
  glove80Enrichment,
} from "./glove80";

export type MoErgoBoard = "glove80" | "go60";

interface MatrixPosition {
  row: number;
  col: number;
}

export interface BoardTransferModel {
  id: MoErgoBoard;
  name: string;
  rows: number;
  cols: number;
  physical: ReadonlyMap<string, string>;
  ledAt: ReadonlyMap<string, number>;
  positionForLed: ReadonlyMap<number, MatrixPosition>;
}

const at = ({ row, col }: MatrixPosition): string => `${row},${col}`;
const position = (row: number, col: number): MatrixPosition => ({ row, col });

function model(
  id: MoErgoBoard,
  name: string,
  rows: number,
  cols: number,
  keys: Array<{ position: MatrixPosition; label: string; led: number }>,
): BoardTransferModel {
  return {
    id,
    name,
    rows,
    cols,
    physical: new Map(keys.map((key) => [at(key.position), key.label])),
    ledAt: new Map(keys.map((key) => [at(key.position), key.led])),
    positionForLed: new Map(keys.map((key) => [key.led, key.position])),
  };
}

const gloveLabels = glove80Enrichment.labels ?? {};
const gloveKeys = GLOVE80_GRID.flatMap((logical, offset) => {
  if (logical === null) return [];
  const keyPosition = position(
    Math.floor(offset / GLOVE80_COLS),
    offset % GLOVE80_COLS,
  );
  return [{
    position: keyPosition,
    label: gloveLabels[at(keyPosition)] ?? `key ${logical}`,
    led: GLOVE80_BOARD_KEYS.get(logical)!.led,
  }];
});

export const GLOVE80_TRANSFER_MODEL = model(
  "glove80",
  "Glove80",
  GLOVE80_ROWS,
  GLOVE80_COLS,
  gloveKeys,
);

const GO60_ROWS = 5;
const GO60_COLS = 14;
const GO60_FINGER_LABELS = [
  ["=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "−"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "\\"],
  ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
] as const;

const go60Keys: Array<{ position: MatrixPosition; label: string; led: number }> = [];
const leftLedByColumn = [26, 22, 17, 12, 7, 3];
const rightLedByColumn = [33, 37, 42, 47, 52, 56];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 6; col += 1) {
    go60Keys.push({
      position: position(row, col),
      label: GO60_FINGER_LABELS[row][col],
      led: leftLedByColumn[col] + row,
    });
  }
  for (let col = 8; col < 14; col += 1) {
    go60Keys.push({
      position: position(row, col),
      label: GO60_FINGER_LABELS[row][col - 2],
      led: rightLedByColumn[col - 8] + row,
    });
  }
}
for (const [col, label, led] of [
  [2, "lower-left outer", 21],
  [3, "lower-left middle", 16],
  [4, "lower-left inner", 11],
  [9, "lower-right inner", 41],
  [10, "lower-right middle", 46],
  [11, "lower-right outer", 51],
] as const) {
  go60Keys.push({ position: position(4, col), label, led });
}
for (let row = 0; row < 3; row += 1) {
  go60Keys.push({ position: position(row, 6), label: `left thumb ${row + 1}`, led: row });
  go60Keys.push({ position: position(row, 7), label: `right thumb ${3 - row}`, led: 30 + row });
}

export const GO60_TRANSFER_MODEL = model(
  "go60",
  "Go60",
  GO60_ROWS,
  GO60_COLS,
  go60Keys,
);

const BOARD_MODELS: Record<MoErgoBoard, BoardTransferModel> = {
  glove80: GLOVE80_TRANSFER_MODEL,
  go60: GO60_TRANSFER_MODEL,
};

/**
 * Go60's four full finger rows correspond to Glove80 rows 1–4. Its partial
 * bottom row keeps Glove80 r5c2–4/r5c9–11, and its three-key thumb arcs keep
 * Glove80's lower arcs. Glove80's function row, upper thumb arcs, and outer
 * two bottom keys on each half therefore have no Go60 destination.
 */
const GO60_TO_GLOVE80: ReadonlyMap<string, MatrixPosition> = new Map([
  ...Array.from({ length: 4 }, (_, row) =>
    [...Array.from({ length: 6 }, (_, col) => col), ...Array.from({ length: 6 }, (_, i) => i + 8)]
      .map((col): [string, MatrixPosition] => [at(position(row, col)), position(row + 1, col)]),
  ).flat(),
  ...[2, 3, 4, 9, 10, 11].map(
    (col): [string, MatrixPosition] => [at(position(4, col)), position(5, col)],
  ),
  ...Array.from({ length: 3 }, (_, row) =>
    [6, 7].map(
      (col): [string, MatrixPosition] => [at(position(row, col)), position(row + 3, col)],
    ),
  ).flat(),
]);

const GLOVE80_TO_GO60: ReadonlyMap<string, MatrixPosition> = new Map(
  [...GO60_TO_GLOVE80].map(([go60, glove80]) => [at(glove80), parsePosition(go60)]),
);

function parsePosition(value: string): MatrixPosition {
  const [row, col] = value.split(",").map(Number);
  return { row, col };
}

export function boardForMatrix(rows: number, cols: number): BoardTransferModel {
  const found = Object.values(BOARD_MODELS).find(
    (candidate) => candidate.rows === rows && candidate.cols === cols,
  );
  if (!found) {
    throw new Error(
      `Configuration transfer supports Glove80 (6x14) and Go60 (5x14); found ${rows}x${cols}`,
    );
  }
  return found;
}

export function boardForTarget(
  productName: string,
  rows: number,
  cols: number,
): BoardTransferModel {
  const board = boardForMatrix(rows, cols);
  if (!productName.toLowerCase().includes(board.name.toLowerCase())) {
    throw new Error(
      `Configuration transfer supports Glove80 and Go60; this ${rows}x${cols} keyboard reports itself as ${productName}`,
    );
  }
  return board;
}

export function boardForSnapshot(snapshot: RuntimeSnapshot): BoardTransferModel {
  const size = snapshot.layers[0]?.length;
  if (size === undefined) throw new Error("Configuration has no keymap layers");
  if (snapshot.layers.some((layer) => layer.length !== size)) {
    throw new Error("Configuration keymap layers do not all use the same matrix size");
  }
  const found = Object.values(BOARD_MODELS).find(
    (candidate) => candidate.rows * candidate.cols === size,
  );
  if (!found) {
    throw new Error(
      `Configuration transfer supports Glove80 (84 matrix cells) and Go60 (70 matrix cells); found ${size}`,
    );
  }
  return found;
}

function meaningful(action: KeyAction): boolean {
  return action !== "No" && action !== "Transparent";
}

function actionSummary(action: KeyAction): string {
  return typeof action === "string" ? action : JSON.stringify(action);
}

function keyNote(
  source: BoardTransferModel,
  target: BoardTransferModel,
  layer: number,
  keyPosition: MatrixPosition,
  action: KeyAction,
): ImportNote {
  const label = source.physical.get(at(keyPosition));
  return {
    approximated: false,
    location: `layer ${layer}, ${source.name} ${label ? `${label} ` : ""}[${keyPosition.row}, ${keyPosition.col}]`,
    message: `${actionSummary(action)} has no corresponding key on ${target.name}.`,
  };
}

function transferMap(source: MoErgoBoard): ReadonlyMap<string, MatrixPosition> {
  return source === "go60" ? GO60_TO_GLOVE80 : GLOVE80_TO_GO60;
}

function targetLedMap(model: KeyboardModel): ReadonlyMap<string, number> {
  return new Map(
    model.keys.flatMap((key) =>
      key.ledId === undefined ? [] : [[`${key.row},${key.col}`, key.ledId] as const],
    ),
  );
}

export interface SnapshotTransfer {
  snapshot: RuntimeSnapshot;
  notes: ImportNote[];
  source: MoErgoBoard;
  target: MoErgoBoard;
  converted: boolean;
}

/**
 * Translate the source board's physical positions onto the peer board. Target
 * positions with no source counterpart stay as they are; source bindings with
 * no destination are retained in the report instead of disappearing silently.
 */
export function transferSnapshot(
  sourceSnapshot: RuntimeSnapshot,
  targetRows: number,
  targetCols: number,
  targetSnapshot: RuntimeSnapshot,
  targetKeyboard: KeyboardModel,
): SnapshotTransfer {
  const source = boardForSnapshot(sourceSnapshot);
  const target = boardForMatrix(targetRows, targetCols);
  if (source.id === target.id) {
    return {
      snapshot: sourceSnapshot,
      notes: [],
      source: source.id,
      target: target.id,
      converted: false,
    };
  }

  const mapping = transferMap(source.id);
  const notes: ImportNote[] = [];
  const layers = sourceSnapshot.layers.map((sourceLayer, layer) => {
    const targetLayer = targetSnapshot.layers[layer];
    if (!targetLayer) {
      throw new Error(
        `Layout has ${sourceSnapshot.layers.length} layers; ${target.name} supports ${targetSnapshot.layers.length}`,
      );
    }
    const result = structuredClone(targetLayer);
    for (let offset = 0; offset < sourceLayer.length; offset += 1) {
      const sourcePosition = position(Math.floor(offset / source.cols), offset % source.cols);
      const destination = mapping.get(at(sourcePosition));
      const action = sourceLayer[offset];
      if (destination) {
        result[destination.row * target.cols + destination.col] = action;
      } else if (meaningful(action)) {
        notes.push(keyNote(source, target, layer, sourcePosition, action));
      }
    }
    return result;
  });

  const behaviors = structuredClone(sourceSnapshot.behaviors);
  if (behaviors?.hold_trigger_positions) {
    behaviors.hold_trigger_positions = behaviors.hold_trigger_positions.flatMap((entry) => {
      const destination = mapping.get(at(entry));
      if (destination) return [{ ...entry, ...destination }];
      notes.push({
        approximated: false,
        location: `morse hold trigger [${entry.row}, ${entry.col}]`,
        message: `The ${source.name} position has no corresponding key on ${target.name}.`,
      });
      return [];
    });
  }

  const lighting = structuredClone(sourceSnapshot.lighting);
  if (lighting) {
    const targetLeds = targetLedMap(targetKeyboard);
    const mappedTargetLeds = new Set(
      [...mapping.values()].flatMap((destination) => {
        const led = targetLeds.get(at(destination));
        return led === undefined ? [] : [led];
      }),
    );
    const mapLed = (led: number): number | undefined => {
      const sourcePosition = source.positionForLed.get(led);
      const destination = sourcePosition && mapping.get(at(sourcePosition));
      return destination ? targetLeds.get(at(destination)) : undefined;
    };

    const convertedScenes = lighting.scenes.flatMap((cell, index) => {
      const led = mapLed(cell.led_id);
      if (led !== undefined) return [{ ...cell, led_id: led }];
      notes.push({
        approximated: false,
        location: `lighting scene ${index}, LED ${cell.led_id}`,
        message: `The ${source.name} light has no corresponding key on ${target.name}.`,
      });
      return [];
    });
    const preservedScenes = (targetSnapshot.lighting?.scenes ?? []).filter(
      (cell) => !mappedTargetLeds.has(cell.led_id),
    );
    lighting.scenes = [...preservedScenes, ...convertedScenes];

    if (lighting.conditional_scenes) {
      const convertedRules = lighting.conditional_scenes.flatMap((rule, index) => {
        const led = mapLed(rule.cell.led_id);
        if (led !== undefined) {
          return [{ ...rule, cell: { ...rule.cell, led_id: led } }];
        }
        notes.push({
          approximated: false,
          location: `conditional lighting rule ${index}, LED ${rule.cell.led_id}`,
          message: `The ${source.name} light has no corresponding key on ${target.name}.`,
        });
        return [];
      });
      const preservedRules = (targetSnapshot.lighting?.conditional_scenes ?? []).filter(
        (rule) => !mappedTargetLeds.has(rule.cell.led_id),
      );
      lighting.conditional_scenes = [...preservedRules, ...convertedRules];
    }
  }

  return {
    snapshot: { ...sourceSnapshot, layers, behaviors, lighting },
    notes,
    source: source.id,
    target: target.id,
    converted: true,
  };
}
