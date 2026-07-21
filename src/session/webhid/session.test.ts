import { describe, expect, it, vi } from "vitest";
import type {
  LightingEffect,
  LightingOverlayCell,
  LightingOverlayPageRequest,
  LightingState,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { readLightingOverlay } from "./session";

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

interface ReturnTypeShape {
  revision: number;
  total_count: number;
  items: LightingOverlayCell[];
}
