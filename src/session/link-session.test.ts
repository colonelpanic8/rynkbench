import { describe, expect, it, vi } from "vitest";
import type {
  LightingConditionalSceneCell,
  LightingEffect,
  LightingExtensionParam,
  LightingOverlayCell,
  LightingOverlayPageRequest,
  LightingRuntimeConditionalSceneStatus,
  LightingState,
} from "../vendor/rynk-wasm/rynk_wasm";
import {
  decodeLayerState,
  readLightingExtensionNames,
  readLightingExtensionParams,
  readLightingOverlay,
  readLightingRuntimeConditionalScenes,
} from "./link-session";

const effect: LightingEffect = { Solid: { color: { r: 1, g: 2, b: 3 } } };

function cell(led_id: number, ttl_ms?: number): LightingOverlayCell {
  return { led_id, effect, ttl_ms };
}

function state(revision: number, overlay_len: number): LightingState {
  return {
    revision,
    output_enabled: true,
    output_brightness: 255,
    background: {
      enabled: true,
      hue: 0,
      saturation: 0,
      value: 0,
      speed: 0,
      mode: "Solid",
    },
    overlay_len,
  };
}

describe("WebHID overlay readback", () => {
  it("probes and returns an empty overlay", async () => {
    const get_lighting_overlay = vi.fn(async (request: LightingOverlayPageRequest) => ({
      revision: request.revision,
      total_count: 0,
      items: [],
    }));

    await expect(
      readLightingOverlay({
        get_lighting_state: async () => state(4, 0),
        get_lighting_overlay,
      }),
    ).resolves.toEqual([]);
    expect(get_lighting_overlay).toHaveBeenCalledWith({ revision: 4, offset: 0 });
  });

  it("assembles multiple revision-pinned pages", async () => {
    const cells = [cell(1), cell(2, 900), cell(3)];
    const get_lighting_overlay = vi.fn(async ({ revision, offset }: LightingOverlayPageRequest) => ({
      revision,
      total_count: cells.length,
      items: cells.slice(offset, offset + 2),
    }));

    await expect(
      readLightingOverlay({
        get_lighting_state: async () => state(7, cells.length),
        get_lighting_overlay,
      }),
    ).resolves.toEqual(cells);
    expect(get_lighting_overlay).toHaveBeenNthCalledWith(1, { revision: 7, offset: 0 });
    expect(get_lighting_overlay).toHaveBeenNthCalledWith(2, { revision: 7, offset: 2 });
  });

  it("restarts after a state revision conflict", async () => {
    const get_lighting_state = vi
      .fn<() => Promise<LightingState>>()
      .mockResolvedValueOnce(state(10, 1))
      .mockResolvedValueOnce(state(11, 1));
    const get_lighting_overlay = vi
      .fn<(request: LightingOverlayPageRequest) => Promise<ReturnTypeShape>>()
      .mockRejectedValueOnce(new Error("StateRevisionConflict: expected 10, current 11"))
      .mockResolvedValueOnce({ revision: 11, total_count: 1, items: [cell(8, 500)] });

    await expect(
      readLightingOverlay({ get_lighting_state, get_lighting_overlay }),
    ).resolves.toEqual([cell(8, 500)]);
    expect(get_lighting_state).toHaveBeenCalledTimes(2);
  });

  it("rejects a page that disagrees with the pinned state", async () => {
    await expect(
      readLightingOverlay({
        get_lighting_state: async () => state(3, 1),
        get_lighting_overlay: async () => ({ revision: 3, total_count: 2, items: [cell(1)] }),
      }),
    ).rejects.toThrow("overlay page disagrees with pinned state");
  });

  it("surfaces an unsupported command for the connect-time fallback", async () => {
    await expect(
      readLightingOverlay({
        get_lighting_state: async () => state(2, 0),
        get_lighting_overlay: async () => {
          throw new Error("UnknownCmd: GetLightingOverlay");
        },
      }),
    ).rejects.toThrow("UnknownCmd");
  });
});

describe("WebHID extension-name readback", () => {
  const extension = {
    revision: 4,
    effect_count: 5,
    palette_count: 0,
    state: { effect: 0, palette: 0, value: 128, speed: 128 },
  };

  it("assembles exact pages", async () => {
    const all = ["A", "B", "C", "D", "E"];
    await expect(
      readLightingExtensionNames(
        {
          get_lighting_extension: async () => extension,
          get_lighting_extension_names: async ({ offset }) => ({
            total: all.length,
            items: all.slice(offset, offset + 3),
          }),
        },
        "Effects",
      ),
    ).resolves.toEqual(all);
  });

  it("rejects a page that exceeds the advertised total", async () => {
    await expect(
      readLightingExtensionNames(
        {
          get_lighting_extension: async () => extension,
          get_lighting_extension_names: async ({ offset }) => ({
            total: 5,
            items: offset === 0 ? ["A", "B", "C", "D"] : ["E", "unexpected"],
          }),
        },
        "Effects",
      ),
    ).rejects.toThrow("extension name page exceeded advertised total 5");
  });
});

describe("WebHID extension-parameter readback", () => {
  const param = (name: string, value: number): LightingExtensionParam => ({
    name,
    min: 0,
    max: 32,
    default: 8,
    value,
  });

  it("assembles chunked pages for one effect", async () => {
    const all = [param("Density", 8), param("Interval", 60), param("Trail", 2)];
    const get_lighting_extension_params = vi.fn(async ({ offset }: { offset: number }) => ({
      revision: 6,
      total: all.length,
      items: all.slice(offset, offset + 2),
    }));

    await expect(
      readLightingExtensionParams({ get_lighting_extension_params }, 3),
    ).resolves.toEqual(all);
    expect(get_lighting_extension_params).toHaveBeenNthCalledWith(1, { effect: 3, offset: 0 });
    expect(get_lighting_extension_params).toHaveBeenNthCalledWith(2, { effect: 3, offset: 2 });
  });

  it("returns an empty list for an effect with no parameters", async () => {
    const get_lighting_extension_params = vi.fn(async () => ({
      revision: 2,
      total: 0,
      items: [],
    }));
    await expect(
      readLightingExtensionParams({ get_lighting_extension_params }, 0),
    ).resolves.toEqual([]);
    expect(get_lighting_extension_params).toHaveBeenCalledTimes(1);
  });

  it("restarts the read when the revision moves mid-read", async () => {
    const all = [param("Density", 8), param("Interval", 60), param("Trail", 2)];
    let revision = 4;
    const get_lighting_extension_params = vi.fn(async ({ offset }: { offset: number }) => {
      // The second page of the first attempt lands under a new revision.
      if (offset > 0 && revision === 4) revision = 5;
      return { revision, total: all.length, items: all.slice(offset, offset + 2) };
    });

    await expect(
      readLightingExtensionParams({ get_lighting_extension_params }, 1),
    ).resolves.toEqual(all);
    // Two pages for the aborted attempt, two more for the clean one.
    expect(get_lighting_extension_params).toHaveBeenCalledTimes(4);
  });

  it("gives up after repeated revision churn", async () => {
    let revision = 0;
    await expect(
      readLightingExtensionParams(
        {
          get_lighting_extension_params: async ({ offset }) => ({
            revision: offset === 0 ? revision : ++revision,
            total: 4,
            items: [param("a", 1), param("b", 2)],
          }),
        },
        0,
      ),
    ).rejects.toThrow("extension parameters kept changing across 3 read attempts");
  });

  it("rejects a page that exceeds the advertised total", async () => {
    await expect(
      readLightingExtensionParams(
        {
          get_lighting_extension_params: async () => ({
            revision: 1,
            total: 1,
            items: [param("a", 1), param("b", 2)],
          }),
        },
        0,
      ),
    ).rejects.toThrow("extension parameter page exceeded advertised total 1");
  });

  it("surfaces an unsupported command so callers can feature-detect", async () => {
    await expect(
      readLightingExtensionParams(
        {
          get_lighting_extension_params: async () => {
            throw new Error("UnknownCmd: GetLightingExtensionParams");
          },
        },
        0,
      ),
    ).rejects.toThrow("UnknownCmd");
  });
});

interface ReturnTypeShape {
  revision: number;
  total_count: number;
  items: LightingOverlayCell[];
}

describe("WebHID runtime conditional readback", () => {
  const rule = (led_id: number, layer: number): LightingConditionalSceneCell => ({
    conditions: { layer: { layer, active: true }, battery: undefined },
    led_id,
    effect,
  });

  const status = (
    revision: number,
    cell_len: number,
  ): LightingRuntimeConditionalSceneStatus => ({
    revision,
    capacity: 32,
    cell_len,
    chunk_capacity: 8,
  });

  it("returns an empty table without paging", async () => {
    const get_lighting_runtime_conditional_scenes = vi.fn();
    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => status(3, 0),
        get_lighting_runtime_conditional_scenes,
      }),
    ).resolves.toEqual([]);
    expect(get_lighting_runtime_conditional_scenes).not.toHaveBeenCalled();
  });

  it("assembles revision-pinned pages in table order", async () => {
    // Order carries meaning: later rules win shared LEDs, so the assembled
    // table must come back exactly as the device pages it.
    const cells = [rule(1, 0), rule(1, 1), rule(2, 2)];
    const get_lighting_runtime_conditional_scenes = vi.fn(
      async ({ revision, offset }: { revision: number; offset: number }) => ({
        revision,
        total_count: cells.length,
        items: cells.slice(offset, offset + 2),
      }),
    );

    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => status(9, cells.length),
        get_lighting_runtime_conditional_scenes,
      }),
    ).resolves.toEqual(cells);
    expect(get_lighting_runtime_conditional_scenes).toHaveBeenNthCalledWith(1, {
      revision: 9,
      offset: 0,
    });
    expect(get_lighting_runtime_conditional_scenes).toHaveBeenNthCalledWith(2, {
      revision: 9,
      offset: 2,
    });
  });

  it("restarts from a fresh status when the revision drifts mid-read", async () => {
    const cells = [rule(4, 1), rule(5, 1), rule(6, 1)];
    const get_lighting_runtime_conditional_scene_status = vi
      .fn<() => Promise<LightingRuntimeConditionalSceneStatus>>()
      .mockResolvedValueOnce(status(10, cells.length))
      .mockResolvedValueOnce(status(11, cells.length));
    let served = 0;
    const get_lighting_runtime_conditional_scenes = vi.fn(
      async ({ revision, offset }: { revision: number; offset: number }) => {
        // The second page of the first attempt lands under a new revision.
        served += 1;
        const drifted = served === 2;
        return {
          revision: drifted ? revision + 1 : revision,
          total_count: cells.length,
          items: cells.slice(offset, offset + 2),
        };
      },
    );

    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status,
        get_lighting_runtime_conditional_scenes,
      }),
    ).resolves.toEqual(cells);
    expect(get_lighting_runtime_conditional_scene_status).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated revision churn", async () => {
    let revision = 0;
    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => status(++revision, 4),
        get_lighting_runtime_conditional_scenes: async ({ offset }) => ({
          revision: offset === 0 ? revision : revision + 1,
          total_count: 4,
          items: [rule(1, 0), rule(2, 0)],
        }),
      }),
    ).rejects.toThrow("runtime conditional table kept changing across 3 read attempts");
  });

  it("rejects a page that exceeds the advertised total", async () => {
    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => status(1, 1),
        get_lighting_runtime_conditional_scenes: async ({ revision }) => ({
          revision,
          total_count: 1,
          items: [rule(1, 0), rule(2, 0)],
        }),
      }),
    ).rejects.toThrow("runtime conditional page exceeded advertised total 1");
  });

  it("rejects a stalled page", async () => {
    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => status(1, 2),
        get_lighting_runtime_conditional_scenes: async ({ revision }) => ({
          revision,
          total_count: 2,
          items: [],
        }),
      }),
    ).rejects.toThrow("runtime conditional read stalled at cell 0 of 2");
  });

  it("surfaces an unsupported status read so callers can feature-detect", async () => {
    await expect(
      readLightingRuntimeConditionalScenes({
        get_lighting_runtime_conditional_scene_status: async () => {
          throw new Error("UnknownCmd: GetLightingRuntimeConditionalSceneStatus");
        },
        get_lighting_runtime_conditional_scenes: async () => {
          throw new Error("unreachable");
        },
      }),
    ).rejects.toThrow("UnknownCmd");
  });
});

describe("WebHID layer-state readback", () => {
  it("decodes every active bit across bitmap bytes", () => {
    expect(
      decodeLayerState({
        default_layer: 2,
        active_bitmap: [0b00010110, 0b00000010],
      }),
    ).toEqual({
      defaultLayer: 2,
      activeLayers: [1, 2, 4, 9],
      complete: true,
    });
  });
});
