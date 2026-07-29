import { beforeEach, describe, expect, it } from "vitest";
import { RYNK_USAGE, RYNK_USAGE_PAGE } from "../rynk-link";
import { grantedRynkDevices, rejectRynkDevice } from "./link";

function device(name: string, rynk = true): HIDDevice {
  return {
    productName: name,
    opened: false,
    collections: [
      { usagePage: rynk ? RYNK_USAGE_PAGE : 0x01, usage: rynk ? RYNK_USAGE : 0x06 },
    ],
  } as unknown as HIDDevice;
}

function grant(devices: HIDDevice[], fail = false) {
  (globalThis as { navigator?: unknown }).navigator = {
    hid: {
      getDevices: () => (fail ? Promise.reject(new Error("denied")) : Promise.resolve(devices)),
    },
  };
}

describe("granted Rynk device enumeration", () => {
  beforeEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  /// The bug this guards: taking only the first Rynk interface reconnects to
  /// whichever grant sorts first. With a second keyboard attached that is a
  /// coin flip, and a losing flip repeats on every reload.
  it("returns every granted Rynk interface, not just the first", async () => {
    const first = device("Glove80");
    const second = device("Glove80");
    grant([device("Some Keyboard", false), first, second]);

    expect(await grantedRynkDevices()).toEqual([first, second]);
  });

  it("skips interfaces that failed the handshake so the picker becomes reachable", async () => {
    const first = device("Glove80");
    const second = device("Glove80");
    grant([first, second]);

    rejectRynkDevice(first);
    expect(await grantedRynkDevices()).toEqual([second]);

    // With every grant ruled out the caller sees an empty list, which is what
    // sends it to the browser picker instead of retrying a dead device.
    rejectRynkDevice(second);
    expect(await grantedRynkDevices()).toEqual([]);
  });

  it("treats an unavailable permission store as no grants", async () => {
    grant([], true);
    expect(await grantedRynkDevices()).toEqual([]);
  });
});
