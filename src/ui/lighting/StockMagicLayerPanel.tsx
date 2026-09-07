import { useRef, useState } from "react";
import { Button } from "../kit";
import { layerName } from "../layer-names";
import { hasPendingConfigurationWrite, useWorkbench } from "../state";
import { STOCK_PROFILE_KEYS, writeStockMagicLayer } from "./stockMagicLayer";

export function StockMagicLayerPanel({ layer }: { layer: number }) {
  const { bundle, state, io, dispatch } = useWorkbench();
  const status = bundle.runtimeConditionalStatus;
  const [message, setMessage] = useState<string | null>(null);
  const installing = useRef(false);
  const busy = hasPendingConfigurationWrite(state);
  const name = layerName(state.layerMetadata, layer);
  const profiles = Math.min(bundle.caps.num_ble_profiles, STOCK_PROFILE_KEYS.length);

  if (!status) return null;

  const install = async () => {
    if (installing.current || busy || state.batchMode) return;
    installing.current = true;
    dispatch({ type: "lightingBusy", busy: true, error: null });
    setMessage("Installing keys, scene, and indicators…");
    try {
      const result = await writeStockMagicLayer(
        {
          setKey: (row, col, action) =>
            io.setKey(layer, row, col, action, { history: "invalidate" }),
          applyScenes: (cells) => io.applyScenes(cells),
          applyRules: (rules) => io.applyConditionalScenes(rules),
          setWakeLayers: (mask) => io.setWakeLayers(mask),
        },
        {
          layer,
          numLayers: bundle.caps.num_layers,
          profiles,
          keys: bundle.model.keys,
          current: state.layers[layer],
          rules: state.runtimeConditionalDraft,
          ruleCapacity: status.capacity,
          scenes: bundle.sceneStatus ? state.scenes : null,
          sceneCapacity: bundle.sceneStatus?.capacity ?? 0,
          wakeLayers: state.lightingOutputMode?.wake_layers ?? null,
        },
      );
      setMessage(
        result.ok
          ? `Installed and verified the stock Magic layer on ${name}. Reach it with a momentary MO(${layer}) key.`
          : result.message,
      );
    } finally {
      installing.current = false;
      dispatch({ type: "lightingBusy", busy: false });
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-accent-deep/40 bg-accent-dim/15 p-3">
      <div className="text-[12.5px] font-medium text-ink">MoErgo stock Magic layer</div>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        Rebuild {name} as the factory Glove80 Magic layer. Bluetooth profiles 1–{profiles} sit
        on the thumbs (T4, T5, T1, T2) with USB output on T6; the Q–T and A–G rows adjust
        speed, saturation, hue, and brightness and toggle or advance effects; each half's
        outer keys carry bootloader and reset; F1 forgets the active profile's pairing.
        Every other key is unbound.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        While the layer is active the left half goes dark: the number row shows active layers
        in magenta, rows 3 and 4 fill green, yellow, or red with each half's battery, and the
        profile and USB keys show lilac unpaired, red paired, green connected, and white when
        carrying typing. The layer also wakes lighting while held.
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
        Not reproduced: caps/num/scroll lock, output fallback, and clear-all-pairings, which
        this firmware cannot express. A rule watches one layer, so layer indicators light
        whenever their layer is active, not only while Magic is held.
      </p>
      {state.batchMode && (
        <p className="mt-2 text-[11px] text-warn">
          Finish batch editing and turn batch mode off to install the keys and lighting together.
        </p>
      )}
      <Button
        variant="primary"
        className="mt-2 w-full"
        disabled={busy || state.batchMode}
        onClick={install}
      >
        Install stock Magic layer on {name}
      </Button>
      {message && (
        <p role="status" className="mt-2 text-[11px] leading-relaxed text-mute">
          {message}
        </p>
      )}
    </div>
  );
}
