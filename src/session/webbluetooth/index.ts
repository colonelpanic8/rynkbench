// Web Bluetooth backend: the same custom Rynk GATT service the desktop app's
// native BLE backend speaks, reached from Chromium directly — including Chrome
// for Android, where no other Rynk transport exists.

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession, REQUEST_TIMEOUT_MS } from "../link-session";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";
import { bluetoothByteLink, requestRynkBluetoothDevice } from "./link";

let lastDevice: BluetoothDevice | null = null;

export const webBluetoothProvider: SessionProvider = {
  kind: "webbluetooth",
  title: "Bluetooth (Web Bluetooth)",
  description:
    "Connect to a Rynk keyboard over Bluetooth LE. Requires Chrome or Edge — including on Android, where it is the only transport that works.",
  available: () => typeof navigator !== "undefined" && "bluetooth" in navigator,
  async connect() {
    // requestDevice must be the first await so the click's user activation is
    // still available to the browser-owned chooser. The chooser is filtered to
    // devices advertising or known to carry the Rynk GATT service.
    return rememberedSession(await requestRynkBluetoothDevice());
  },
  async reconnect() {
    if (!lastDevice) throw new Error("No Bluetooth keyboard has been connected yet");
    // Reconnecting a granted device needs no user gesture and no chooser.
    return rememberedSession(lastDevice);
  },
};

async function rememberedSession(device: BluetoothDevice) {
  const connected = await session(device);
  lastDevice = device;
  return connected;
}

async function session(device: BluetoothDevice) {
  const link = await bluetoothByteLink(device);
  try {
    await initWasm();
    const client = await handshake(link);
    return new LinkSession(client, link, {
      kind: "webbluetooth",
      watchDisconnect(onUnplug) {
        const handler = () => onUnplug();
        device.addEventListener("gattserverdisconnected", handler);
        return () => device.removeEventListener("gattserverdisconnected", handler);
      },
    });
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
}

/** The firmware silently ignores Rynk traffic on an unencrypted link, so a
 * device that paired without bonding hangs rather than erroring — bound the
 * handshake and say what to check. */
async function handshake(link: Awaited<ReturnType<typeof bluetoothByteLink>>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connect(link),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          link.end();
          reject(
            new Error(
              `No Rynk response over Bluetooth within ${REQUEST_TIMEOUT_MS}ms — ` +
                "the keyboard only answers on an encrypted link, so make sure it is " +
                "paired (bonded) with this device and try again",
            ),
          );
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
