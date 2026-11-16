// The io's layers: the default layer, names, and the structural operations
// (duplicate, move, delete). In Draft each changes what you want (ADR 0018);
// in Live the operations plan the rewritten layout against a fresh read and
// write only the difference (ADR 0012), rolling back on failure.

import type { RynkSession } from "../session/types";
import type { WorkbenchState } from "../model/workbench-state";
import { same } from "../model/deep-equal";
import { applyPatch, planSync, readImage, writePlan } from "../sync";
import {
  planLayerDuplicate,
  planLayerRewrite,
  type LayerRewrite,
  type LayerRewriteSnapshot,
  type LayerStructureOperation,
} from "../layers/management";
import { errorMessage } from "../session/errors";
import { draftEditCount, pointingDraftDirty } from "./draft/selectors";
import { draftOf, wantOf } from "./draft/want";
import type { IoContext, IoFeatures, IoWriteResult, WorkbenchIo } from "./io";

type LayerIo = Pick<
  WorkbenchIo,
  "setDefaultLayer" | "renameLayer" | "duplicateLayer" | "moveLayer" | "deleteLayer" | "refreshLayerState"
>;

async function readLayerRewriteSnapshot(
  session: RynkSession,
  state: WorkbenchState,
  config: IoFeatures,
): Promise<LayerRewriteSnapshot> {
  if (state.layerMetadata === null) {
    throw new Error("this firmware does not support persistent layer metadata");
  }
  if (state.behaviorOptions === null) {
    throw new Error("behavior options could not be read, so layer references cannot be rewritten safely");
  }
  if (!config.pointingSupported) {
    throw new Error("pointing configuration could not be read, so layer references cannot be rewritten safely");
  }
  if (state.lightingState !== null && !config.lightingOutputSupported) {
    throw new Error("lighting wake layers could not be read, so layer references cannot be rewritten safely");
  }
  const { layerStateComplete, ...image } = await readImage(session, { ...config, layerMetadata: true });
  if (!layerStateComplete) {
    throw new Error("complete active-layer state is required before editing layer structure");
  }
  return { ...image, compiledScenes: state.compiledScenes, compiledConditionalScenes: state.conditionalScenes };
}

function assertLayerRewriteReadback(expected: LayerRewriteSnapshot, actual: LayerRewriteSnapshot): void {
  // A rewrite carries its `order` (which slot came from where); a read never does.
  const comparable = ({ order: _order, ...snapshot }: LayerRewriteSnapshot & { order?: number[] }) => ({
    ...snapshot,
    compiledScenes: [],
    compiledConditionalScenes: [],
    pointing: snapshot.pointing
      ? { ...snapshot.pointing, revision: 0 }
      : null,
  });
  if (!same(comparable(expected), comparable(actual))) {
    throw new Error("layer transaction read-back did not match the requested rewrite");
  }
}

export function layerIo(context: IoContext): LayerIo {
  const { session, getState, dispatch, features, draft } = context;

  const rejectLayerOperation = (message: string): IoWriteResult => {
    dispatch({ type: "layerOperationError", message });
    return { ok: false, message };
  };

  const runLayerStructure = async (
    operation: LayerStructureOperation | { type: "duplicate"; layer: number },
  ): Promise<IoWriteResult> => {
    const before = getState();
    if (before.layerBusy) return { ok: false, message: "another layer operation is running" };
    if (
      before.lightingBusy ||
      Object.values(before.pending).some((item) => item.status === "pending")
    ) {
      return rejectLayerOperation("wait for pending device writes before editing layers");
    }
    if (before.batchMode) return draftLayerStructure(operation);
    if (draftEditCount(before) > 0) {
      return rejectLayerOperation("apply or discard staged batch edits before editing layers");
    }
    if (pointingDraftDirty(before)) {
      return rejectLayerOperation("apply or discard staged pointing edits before editing layers");
    }
    const drafted = draftOf(before).changes.map(({ item }) => item.kind);
    if (drafted.includes("lighting")) {
      return rejectLayerOperation("apply or discard staged layer lighting before editing layers");
    }
    if (drafted.includes("rules")) {
      return rejectLayerOperation("apply or discard staged conditional lighting before editing layers");
    }
    dispatch({ type: "layerOperationStart" });
    let original: LayerRewriteSnapshot | null = null;
    let writing = false;
    try {
      original = await readLayerRewriteSnapshot(session, getState(), features);
      const plan = rewrite(original, operation);
      writing = true;
      await writePlan(session, planSync(original, plan)); // only what moves (ADR 0012)
      const readback = await readLayerRewriteSnapshot(session, getState(), features);
      assertLayerRewriteReadback(plan, readback);
      dispatch({ type: "layerOperationApplied", rewrite: { ...readback, order: plan.order } });
      return { ok: true };
    } catch (error) {
      let message = errorMessage(error);
      if (original && writing) {
        try {
          const now = await readLayerRewriteSnapshot(session, getState(), features);
          await writePlan(session, planSync(now, original));
        } catch (rollbackError) {
          message += `; rollback also failed: ${errorMessage(rollbackError)}`;
        }
      }
      dispatch({ type: "layerOperationError", message });
      return { ok: false, message };
    }
  };

  /** The layout with the operation done: a move, delete or duplicate. */
  const rewrite = (original: LayerRewriteSnapshot, operation: LayerStructureOperation | { type: "duplicate"; layer: number }): LayerRewrite => {
    if (operation.type !== "duplicate") return planLayerRewrite(original, operation);
    const baseName = original.metadata[operation.layer]?.name;
    if (!baseName) throw new Error(`layer ${operation.layer} is not occupied`);
    const existing = new Set(original.metadata.filter((slot) => slot.occupied).map((slot) => slot.name));
    let name = `${baseName} copy`;
    for (let suffix = 2; existing.has(name); suffix += 1) name = `${baseName} copy ${suffix}`;
    return planLayerDuplicate(original, operation.layer, name, features.sceneCapacity, features.conditionalSceneCapacity);
  };

  /** Draft: the operation rewrites what you want; Send writes the difference
   *  (ADR 0018). It starts from a fresh read with the draft on top, which has
   *  every encoder and the full layer state the rewrite needs. */
  const draftLayerStructure = async (
    operation: LayerStructureOperation | { type: "duplicate"; layer: number },
  ): Promise<IoWriteResult> => {
    dispatch({ type: "layerOperationStart" });
    try {
      const state = getState();
      const read = await readLayerRewriteSnapshot(session, state, features);
      const wanted = { ...read, ...applyPatch(read, draftOf(state).changes) };
      const plan = rewrite(wanted, operation);
      const { order, activeLayers: _active, compiledScenes: _compiled, compiledConditionalScenes: _rules, ...image } = plan;
      dispatch({ type: "layerRewriteDrafted", image: { ...wantOf(getState()), ...image }, order });
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      dispatch({ type: "layerOperationError", message });
      return { ok: false, message };
    }
  };

  return {
    setDefaultLayer(layer) {
      if (draft([{ item: { kind: "defaultLayer" }, value: layer }])) return;
      const prev = getState().defaultLayer;
      dispatch({ type: "defaultLayer", layer });
      session.keymap.setDefaultLayer(layer).catch(() => {
        dispatch({ type: "defaultLayer", layer: prev });
      });
    },
    async renameLayer(layer, name) {
      const state = getState();
      if (state.layerBusy) {
        return { ok: false, message: "another layer operation is running" };
      }
      const trimmed = name.trim();
      if (!trimmed) return rejectLayerOperation("layer name must not be empty");
      if (new TextEncoder().encode(trimmed).length > 32) {
        return rejectLayerOperation("layer name must be at most 32 UTF-8 bytes");
      }
      if (
        state.layerMetadata?.some(
          (candidate, index) => index !== layer && candidate.occupied && candidate.name === trimmed,
        )
      ) {
        return rejectLayerOperation(`layer name '${trimmed}' is already in use`);
      }
      const metadata = state.layerMetadata?.[layer];
      if (!metadata?.occupied) {
        return rejectLayerOperation(`layer ${layer} is not an occupied device layer`);
      }
      const drafted = draft([{ item: { kind: "layerMetadata", layer }, value: { occupied: true, name: trimmed } }]);
      if (drafted) return drafted;
      dispatch({ type: "layerOperationStart" });
      try {
        await session.keymap.setLayerMetadata(layer, { occupied: true, name: trimmed });
        const readback = await session.keymap.getLayerMetadata(layer);
        if (!readback.occupied || readback.name !== trimmed) {
          throw new Error("layer name read-back did not match the write");
        }
        dispatch({ type: "layerMetadataSet", layer, metadata: readback });
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: "layerOperationError", message });
        return { ok: false, message };
      }
    },
    duplicateLayer(layer) {
      return runLayerStructure({ type: "duplicate", layer });
    },
    moveLayer(layer, to) {
      return runLayerStructure({ type: "move", layer, to });
    },
    deleteLayer(layer) {
      return runLayerStructure({ type: "delete", layer });
    },
    refreshLayerState() {
      session.keymap.layerState().then(
        (snapshot) =>
          dispatch({
            type: "topicLayers",
            defaultLayer: snapshot.defaultLayer,
            activeLayers: snapshot.activeLayers,
            complete: snapshot.complete,
          }),
        () => {},
      );
    },
  };
}
