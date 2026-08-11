import { beforeEach, describe, expect, it, vi } from "vitest";
import { RYNK_USAGE, RYNK_USAGE_PAGES } from "../rynk-link";
import { requestRynkDevice } from "./link";

function device(
  name: string,
  usagePage: number = RYNK_USAGE_PAGES[0],
  usage: number = RYNK_USAGE,
): HIDDevice {
  return {
    productName: name,
    opened: false,
    collections: [{ usagePage, usage }],
  } as unknown as HIDDevice;
}

describe("WebHID device chooser", () => {
  beforeEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("asks Chromium for every Rynk usage page and keeps the Rynk interface", async () => {
    const keyboard = device("Glove80", 0xff14);
    const requestDevice = vi.fn(() =>
      Promise.resolve([device("Glove80 keyboard interface", 0x01, 0x06), keyboard]),
    );
    (globalThis as { navigator?: unknown }).navigator = { hid: { requestDevice } };

    await expect(requestRynkDevice()).resolves.toBe(keyboard);
    expect(requestDevice).toHaveBeenCalledWith({
      filters: RYNK_USAGE_PAGES.map((usagePage) => ({ usagePage, usage: RYNK_USAGE })),
    });
  });

  it("reports a cancelled chooser", async () => {
    (globalThis as { navigator?: unknown }).navigator = {
      hid: { requestDevice: () => Promise.resolve([]) },
    };

    await expect(requestRynkDevice()).rejects.toThrow("No Rynk device chosen");
  });
});
