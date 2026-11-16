// The io's lighting: refresh, the lighting state, scenes, the rule table, wake
// layers and the extension effect with its parameters.

import { conditionalTablesEqual } from "../model/lighting/compare";
import { errorMessage } from "../session/errors";
import { paramEffects } from "./lighting-drafts";
import type { IoContext, WorkbenchIo } from "./io";

type LightingIo = Pick<
  WorkbenchIo,
  | "refreshLighting"
  | "setLightingState"
  | "applyScenes"
  | "applyConditionalScenes"
  | "setScenePolicy"
  | "setWakeLayers"
  | "setExtensionState"
  | "loadExtensionParams"
>;

export function lightingIo(context: IoContext): LightingIo {
  const { session, getState, dispatch, features } = context;

  // Feature detection lives here: firmware predating per-effect parameters
  // rejects the request outright, which is recorded as "no parameters" and
  // renders as no extra controls rather than an error.
  const loadParams = (effect: number) => {
    session.lighting.extensionParams(effect).then(
      (items) => dispatch({ type: "extensionParamsLoaded", effect, items }),
      () => dispatch({ type: "extensionParamsLoaded", effect, items: [] }),
    );
  };

  return {
    refreshLighting() {
      Promise.all([
        session.lighting.state(),
        session.lighting.outputMode().catch(() => getState().lightingOutputMode),
        session.lighting.readOverlay().catch(() => Object.values(getState().applied)),
        features.scenesSupported
          ? session.lighting.scenes.readScenes().catch(() => getState().scenes)
          : Promise.resolve(undefined),
        features.extensionSupported
          ? session.lighting.extension().catch(() => getState().lightingExtension)
          : Promise.resolve(undefined),
        features.extensionSupported
          ? session.lighting.extensionLayers().catch(() => getState().lightingExtensionLayers)
          : Promise.resolve(undefined),
        features.conditionalScenesSupported
          ? session.lighting.conditionalScenes
              .read()
              .catch(() => getState().runtimeConditionalScenes)
          : Promise.resolve(undefined),
      ]).then(
        ([
          lightingState,
          outputMode,
          overlay,
          scenes,
          extension,
          extensionLayers,
          runtimeConditional,
        ]) =>
          dispatch({
            type: "lightingRefresh",
            state: lightingState,
            outputMode,
            overlay,
            scenes,
            extension,
            extensionLayers,
            runtimeConditional,
          }),
        () => {},
      );
    },
    setLightingState(mutable) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.setState(mutable).then(
        (lightingState) => dispatch({ type: "lightingStateSet", state: lightingState }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    applyScenes(cells) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      return session.lighting.scenes.replaceScenes(cells).then(
        (lightingState) => {
          dispatch({ type: "scenesApplied", state: lightingState, cells });
          return { ok: true } as const;
        },
        (err) => {
          const message = errorMessage(err);
          dispatch({ type: "lightingBusy", busy: false, error: message });
          return { ok: false, message } as const;
        },
      );
    },
    applyConditionalScenes(cells) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      return (async () => {
        const lightingState = await session.lighting.conditionalScenes.replace(cells);
        const readback = await session.lighting.conditionalScenes.read();
        if (!conditionalTablesEqual(readback, cells)) {
          throw new Error(
            `conditional lighting read-back mismatch: wrote ${cells.length} rule(s), ` +
              `read ${readback.length}`,
          );
        }
        dispatch({ type: "conditionalApplied", state: lightingState, cells: readback });
        return { ok: true } as const;
      })().catch((err) => {
        const message = errorMessage(err);
        dispatch({ type: "lightingBusy", busy: false, error: message });
        return { ok: false, message } as const;
      });
    },
    setScenePolicy(policy) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      session.lighting.scenes.setLayerPolicy(policy).then(
        (lightingState) => dispatch({ type: "scenePolicySet", state: lightingState, policy }),
        (err) => dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    setWakeLayers(layers) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      return session.lighting.setWakeLayers(layers).then(
        (outputMode) => {
          dispatch({ type: "wakeLayersSet", outputMode });
          return { ok: true } as const;
        },
        (err) => {
          const message = errorMessage(err);
          dispatch({ type: "lightingBusy", busy: false, error: message });
          return { ok: false, message } as const;
        },
      );
    },
    setExtensionState(extension, params = [], overlay) {
      dispatch({ type: "lightingBusy", busy: true, error: null });
      // Write only the parts that changed. Each extension mutation is durable,
      // so repeating the unchanged primary/layer selections needlessly queues
      // more flash work and creates extra LightingChange refreshes.
      (async () => {
        const before = getState();
        const currentExtension = before.lightingExtension?.state;
        const currentLayers = before.lightingExtensionLayers;
        if (
          currentExtension === undefined ||
          currentExtension.effect !== extension.effect ||
          currentExtension.palette !== extension.palette ||
          currentExtension.value !== extension.value ||
          currentExtension.speed !== extension.speed
        ) {
          await session.lighting.setExtensionState(extension);
        }
        if (currentLayers !== null && currentLayers.overlay !== overlay) {
          await session.lighting.setExtensionLayers(overlay);
        }
        // Parameters are stored per effect, so a write names its own effect:
        // the overlay slot's effect is edited alongside the base slot's.
        for (const write of params) {
          await session.lighting.setExtensionParam(write.effect, write.index, write.value);
        }
        const [lightingState, appliedExtension, extensionLayers] = await Promise.all([
          session.lighting.state(),
          session.lighting.extension(),
          currentLayers === null ? Promise.resolve(null) : session.lighting.extensionLayers(),
        ]);
        dispatch({
          type: "extensionStateSet",
          state: lightingState,
          extension: appliedExtension.state,
          extensionLayers,
        });
        for (const effect of paramEffects(appliedExtension.state.effect, extensionLayers?.overlay)) {
          loadParams(effect);
        }
      })().catch((err) =>
        dispatch({ type: "lightingBusy", busy: false, error: errorMessage(err) }),
      );
    },
    loadExtensionParams: loadParams,
  };
}
