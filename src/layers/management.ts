import type {
  Action,
  AutoMouseLayerConfig,
  BehaviorOptions,
  ComboDefinition,
  EncoderAction,
  Fork,
  KeyAction,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
  LightingSceneCell,
  Morse,
  PointingConfig,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { LayerMetadata } from "../session/types";

export interface LayerRewriteSnapshot {
  metadata: LayerMetadata[];
  layers: KeyAction[][];
  encoders: EncoderAction[][];
  defaultLayer: number;
  activeLayers: number[];
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  behaviorOptions: BehaviorOptions | null;
  autoMouseLayers: AutoMouseLayerConfig[];
  scenes: LightingSceneCell[];
  runtimeConditionalScenes: LightingExtendedConditionalSceneCell[];
  compiledScenes: LightingSceneCell[];
  compiledConditionalScenes: LightingConditionalSceneCell[];
  wakeLayers: number;
  pointing: PointingConfig | null;
}

export interface LayerRewrite extends LayerRewriteSnapshot {
  /** Destination slot -> source slot. Omitted slots are physically cleared. */
  order: number[];
}

export type LayerStructureOperation =
  | { type: "move"; layer: number; to: number }
  | { type: "delete"; layer: number };

const noEncoder = (): EncoderAction => ({ clockwise: "No", counter_clockwise: "No" });

function occupiedPrefix(metadata: LayerMetadata[]): number {
  const count = metadata.findIndex((slot) => !slot.occupied);
  const occupied = count < 0 ? metadata.length : count;
  if (metadata.slice(occupied).some((slot) => slot.occupied)) {
    throw new Error("layer metadata is sparse; compact it before editing layer structure");
  }
  return occupied;
}

function mapLayer(layer: number, mapping: Map<number, number>, path: string): number {
  const mapped = mapping.get(layer);
  if (mapped === undefined) {
    throw new Error(`${path} refers to deleted layer ${layer}`);
  }
  return mapped;
}

function remapAction(action: Action, mapping: Map<number, number>, path: string): Action {
  if (typeof action === "string") return action;
  if ("LayerOn" in action) return { LayerOn: mapLayer(action.LayerOn, mapping, path) };
  if ("LayerOnWithModifier" in action) {
    return {
      LayerOnWithModifier: [
        mapLayer(action.LayerOnWithModifier[0], mapping, path),
        action.LayerOnWithModifier[1],
      ],
    };
  }
  if ("LayerOff" in action) return { LayerOff: mapLayer(action.LayerOff, mapping, path) };
  if ("LayerToggle" in action)
    return { LayerToggle: mapLayer(action.LayerToggle, mapping, path) };
  if ("DefaultLayer" in action)
    return { DefaultLayer: mapLayer(action.DefaultLayer, mapping, path) };
  if ("LayerToggleOnly" in action)
    return { LayerToggleOnly: mapLayer(action.LayerToggleOnly, mapping, path) };
  if ("OneShotLayer" in action)
    return { OneShotLayer: mapLayer(action.OneShotLayer, mapping, path) };
  if ("PersistentDefaultLayer" in action) {
    return {
      PersistentDefaultLayer: mapLayer(action.PersistentDefaultLayer, mapping, path),
    };
  }
  return structuredClone(action);
}

export function remapKeyAction(
  action: KeyAction,
  mapping: Map<number, number>,
  path: string,
): KeyAction {
  if (typeof action === "string") return action;
  if ("Single" in action) return { Single: remapAction(action.Single, mapping, path) };
  if ("Tap" in action) return { Tap: remapAction(action.Tap, mapping, path) };
  if ("TapHold" in action) {
    return {
      TapHold: [
        remapAction(action.TapHold[0], mapping, `${path} tap`),
        remapAction(action.TapHold[1], mapping, `${path} hold`),
        action.TapHold[2],
      ],
    };
  }
  if ("LayerModTap" in action) {
    return {
      LayerModTap: [
        mapLayer(action.LayerModTap[0], mapping, path),
        action.LayerModTap[1],
        action.LayerModTap[2],
      ],
    };
  }
  return structuredClone(action);
}

function assertImmutableLayerRefsStayPut(
  snapshot: LayerRewriteSnapshot,
  mapping: Map<number, number>,
): void {
  for (const cell of snapshot.compiledScenes) {
    if (mapLayer(cell.layer, mapping, "compiled lighting scene") !== cell.layer) {
      throw new Error(
        `layer ${cell.layer} is fixed by a compiled lighting scene; this firmware cannot move it losslessly`,
      );
    }
  }
  for (const cell of snapshot.compiledConditionalScenes) {
    const condition = cell.conditions.layer;
    if (
      condition !== undefined &&
      mapLayer(condition.layer, mapping, "compiled lighting condition") !== condition.layer
    ) {
      throw new Error(
        `layer ${condition.layer} is fixed by a compiled lighting condition; this firmware cannot move it losslessly`,
      );
    }
  }
}

function remapCombo(
  definition: ComboDefinition,
  mapping: Map<number, number>,
  index: number,
): ComboDefinition {
  if ("Actions" in definition) {
    const combo = definition.Actions;
    return {
      Actions: {
        ...combo,
        actions: combo.actions.map((action, actionIndex) =>
          remapKeyAction(action, mapping, `combo ${index} trigger ${actionIndex}`),
        ),
        output: remapKeyAction(combo.output, mapping, `combo ${index} output`),
        layer:
          combo.layer === undefined
            ? undefined
            : mapLayer(combo.layer, mapping, `combo ${index}`),
      },
    };
  }
  const combo = definition.Positions;
  return {
    Positions: {
      ...combo,
      positions: structuredClone(combo.positions),
      output: remapKeyAction(combo.output, mapping, `combo ${index} output`),
      layer:
        combo.layer === undefined
          ? undefined
          : mapLayer(combo.layer, mapping, `combo ${index}`),
    },
  };
}

function remapMask(mask: number, mapping: Map<number, number>): number {
  let remapped = 0;
  for (let layer = 0; layer < 32; layer += 1) {
    if ((mask & (1 << layer)) === 0) continue;
    const destination = mapping.get(layer);
    if (destination !== undefined) remapped |= 1 << destination;
  }
  return remapped >>> 0;
}

/**
 * Plan a lossless fixed-capacity delete or reorder. This is deliberately pure:
 * callers must finish this preflight before issuing the first device write.
 */
export function planLayerRewrite(
  snapshot: LayerRewriteSnapshot,
  operation: LayerStructureOperation,
): LayerRewrite {
  const occupied = occupiedPrefix(snapshot.metadata);
  if (occupied < 1) throw new Error("the keyboard must retain a base layer");
  if (operation.layer < 0 || operation.layer >= occupied) {
    throw new Error(`layer ${operation.layer} is not occupied`);
  }
  const activeNonDefault = snapshot.activeLayers.filter(
    (layer) => layer !== snapshot.defaultLayer,
  );
  if (activeNonDefault.length > 0) {
    throw new Error(`release active layer(s) ${activeNonDefault.join(", ")} before editing layers`);
  }

  const order = Array.from({ length: occupied }, (_, layer) => layer);
  if (operation.type === "delete") {
    if (occupied === 1) throw new Error("the base layer cannot be deleted");
    if (operation.layer === snapshot.defaultLayer) {
      throw new Error("make another layer the default before deleting this layer");
    }
    order.splice(operation.layer, 1);
  } else {
    if (operation.to < 0 || operation.to >= occupied) {
      throw new Error(`destination ${operation.to} is outside the occupied layer range`);
    }
    const [moved] = order.splice(operation.layer, 1);
    order.splice(operation.to, 0, moved);
  }

  const mapping = new Map(order.map((source, destination) => [source, destination]));
  assertImmutableLayerRefsStayPut(snapshot, mapping);

  const capacity = snapshot.metadata.length;
  const keyCount = snapshot.layers[0]?.length ?? 0;
  const encoderCount = snapshot.encoders[0]?.length ?? 0;
  if (snapshot.layers.length !== capacity || snapshot.encoders.length !== capacity) {
    throw new Error("layer transaction snapshot does not cover the full firmware capacity");
  }

  const layers = Array.from({ length: capacity }, (_, destination) => {
    const source = order[destination];
    if (source === undefined) return Array.from({ length: keyCount }, () => "Transparent" as KeyAction);
    return snapshot.layers[source].map((action, key) =>
      remapKeyAction(action, mapping, `layer ${source} key ${key}`),
    );
  });
  const encoders = Array.from({ length: capacity }, (_, destination) => {
    const source = order[destination];
    if (source === undefined) return Array.from({ length: encoderCount }, noEncoder);
    return snapshot.encoders[source].map((encoder, index) => ({
      clockwise: remapKeyAction(encoder.clockwise, mapping, `layer ${source} encoder ${index}`),
      counter_clockwise: remapKeyAction(
        encoder.counter_clockwise,
        mapping,
        `layer ${source} encoder ${index}`,
      ),
    }));
  });
  const metadata = Array.from({ length: capacity }, (_, destination) => {
    const source = order[destination];
    return source === undefined
      ? { occupied: false, name: "" }
      : structuredClone(snapshot.metadata[source]);
  });

  const behaviorOptions = snapshot.behaviorOptions
    ? {
        ...structuredClone(snapshot.behaviorOptions),
        tri_layer: snapshot.behaviorOptions.tri_layer?.map((layer) =>
          mapLayer(layer, mapping, "tri-layer behavior"),
        ) as [number, number, number] | undefined,
      }
    : null;
  const pointing = snapshot.pointing
    ? {
        ...structuredClone(snapshot.pointing),
        overrides: snapshot.pointing.overrides.map((override) => ({
          ...structuredClone(override),
          layer: mapLayer(override.layer, mapping, "pointing override"),
        })),
      }
    : null;

  return {
    ...snapshot,
    order,
    metadata,
    layers,
    encoders,
    defaultLayer: mapLayer(snapshot.defaultLayer, mapping, "default layer"),
    activeLayers: snapshot.activeLayers.map((layer) =>
      mapLayer(layer, mapping, "active layer state"),
    ),
    combos: snapshot.combos.map((combo, index) => remapCombo(combo, mapping, index)),
    morse: snapshot.morse.map((morse, index) => ({
      ...structuredClone(morse),
      actions: morse.actions.map(([pattern, action]) => [
        pattern,
        remapAction(action, mapping, `morse ${index}`),
      ]),
    })),
    forks: snapshot.forks.map((fork, index) => ({
      ...structuredClone(fork),
      trigger: remapKeyAction(fork.trigger, mapping, `fork ${index} trigger`),
      negative_output: remapKeyAction(fork.negative_output, mapping, `fork ${index} negative`),
      positive_output: remapKeyAction(fork.positive_output, mapping, `fork ${index} positive`),
    })),
    behaviorOptions,
    autoMouseLayers: snapshot.autoMouseLayers.map((config) => ({
      ...structuredClone(config),
      target_layer: mapLayer(config.target_layer, mapping, "auto-mouse layer"),
    })),
    scenes: snapshot.scenes.flatMap((cell) => {
      const layer = mapping.get(cell.layer);
      return layer === undefined ? [] : [{ ...structuredClone(cell), layer }];
    }),
    runtimeConditionalScenes: snapshot.runtimeConditionalScenes.map((cell, index) => {
      const condition = cell.cell.conditions.layer;
      return {
        ...structuredClone(cell),
        cell: {
          ...structuredClone(cell.cell),
          conditions: {
            ...structuredClone(cell.cell.conditions),
            layer:
              condition === undefined
                ? undefined
                : {
                    ...condition,
                    layer: mapLayer(
                      condition.layer,
                      mapping,
                      `runtime lighting condition ${index}`,
                    ),
                  },
          },
        },
      };
    }),
    wakeLayers: remapMask(snapshot.wakeLayers, mapping),
    pointing,
  };
}

export function planLayerDuplicate(
  snapshot: LayerRewriteSnapshot,
  source: number,
  name: string,
  sceneCapacity: number | null,
  conditionalSceneCapacity: number | null = null,
): LayerRewrite {
  const occupied = occupiedPrefix(snapshot.metadata);
  if (source < 0 || source >= occupied) throw new Error(`layer ${source} is not occupied`);
  if (occupied >= snapshot.metadata.length) {
    throw new Error(`firmware layer capacity (${snapshot.metadata.length}) is full`);
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("layer name must not be empty");
  if (new TextEncoder().encode(trimmed).length > 32) {
    throw new Error("layer name must be at most 32 UTF-8 bytes");
  }
  if (snapshot.metadata.some((slot) => slot.occupied && slot.name === trimmed)) {
    throw new Error(`layer name '${trimmed}' is already in use`);
  }
  if (snapshot.compiledScenes.some((cell) => cell.layer === source)) {
    throw new Error(
      `layer ${source} has a compiled lighting scene; this firmware cannot duplicate it losslessly`,
    );
  }
  if (
    snapshot.compiledConditionalScenes.some(
      (cell) => cell.conditions.layer?.layer === source,
    )
  ) {
    throw new Error(
      `layer ${source} has a compiled lighting condition; this firmware cannot duplicate it losslessly`,
    );
  }

  const destination = occupied;
  const selfMapping = new Map<number, number>(
    snapshot.metadata.map((_, layer) => [layer, layer]),
  );
  selfMapping.set(source, destination);
  const layers = snapshot.layers.map((layer) => structuredClone(layer));
  layers[destination] = snapshot.layers[source].map((action, key) =>
    remapKeyAction(action, selfMapping, `duplicated layer key ${key}`),
  );
  const encoders = snapshot.encoders.map((layer) => structuredClone(layer));
  encoders[destination] = snapshot.encoders[source].map((encoder, index) => ({
    clockwise: remapKeyAction(encoder.clockwise, selfMapping, `duplicated encoder ${index}`),
    counter_clockwise: remapKeyAction(
      encoder.counter_clockwise,
      selfMapping,
      `duplicated encoder ${index}`,
    ),
  }));
  const scenes = [
    ...structuredClone(snapshot.scenes),
    ...snapshot.scenes
      .filter((cell) => cell.layer === source)
      .map((cell) => ({ ...structuredClone(cell), layer: destination })),
  ];
  if (sceneCapacity !== null && scenes.length > sceneCapacity) {
    throw new Error(`duplicating this layer would exceed lighting scene capacity ${sceneCapacity}`);
  }
  const runtimeConditionalScenes = [
    ...structuredClone(snapshot.runtimeConditionalScenes),
    ...snapshot.runtimeConditionalScenes
      .filter((cell) => cell.cell.conditions.layer?.layer === source)
      .map((cell) => ({
        ...structuredClone(cell),
        cell: {
          ...structuredClone(cell.cell),
          conditions: {
            ...structuredClone(cell.cell.conditions),
            layer: {
              ...cell.cell.conditions.layer!,
              layer: destination,
            },
          },
        },
      })),
  ];
  if (
    conditionalSceneCapacity !== null &&
    runtimeConditionalScenes.length > conditionalSceneCapacity
  ) {
    throw new Error(
      `duplicating this layer would exceed conditional lighting capacity ${conditionalSceneCapacity}`,
    );
  }
  const metadata = snapshot.metadata.map((slot) => structuredClone(slot));
  metadata[destination] = { occupied: true, name: trimmed };
  const wakeLayers =
    (snapshot.wakeLayers & (1 << source)) === 0
      ? snapshot.wakeLayers
      : (snapshot.wakeLayers | (1 << destination)) >>> 0;

  return {
    ...structuredClone(snapshot),
    order: Array.from({ length: destination + 1 }, (_, layer) => layer),
    metadata,
    layers,
    encoders,
    scenes,
    runtimeConditionalScenes,
    wakeLayers,
  };
}
