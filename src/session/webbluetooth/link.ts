// Web Bluetooth byte link for the firmware's custom Rynk GATT service — the
// browser counterpart of the desktop app's bluest backend (src-tauri/src/ble.rs)
// and the only Rynk transport reachable from Chrome for Android: WebHID and
// Web Serial are desktop-only there, and Android's Bluetooth stack owns
// HID-over-GATT outright, so the vendor HID interface is closed to apps.
//
// Like the other BLE byte links this is a plain byte stream — no report
// padding. The firmware chunks notifications to the negotiated MTU itself;
// outbound frames are chunked here. Framing (COBS) stays in the wasm driver.

import { RynkFrameBuffer, type RynkByteLink } from "../rynk-link";

// Source of truth: `rmk_types::protocol::rynk` in the pinned rmk fork. Copied
// for the same reason src-tauri/src/ble.rs copies them — this package builds
// with no git dependency on the fork.
export const RYNK_SERVICE_UUID = "10900067-537f-4f0a-9b55-929e271f61ab";
export const RYNK_INPUT_CHAR_UUID = "80f9319b-0c74-43a5-9738-c59d6dda3db9";
export const RYNK_OUTPUT_CHAR_UUID = "19802524-6f90-4346-93c2-63dbc509ab55";

/** ATT-minimum MTU payload. Web Bluetooth never reveals the negotiated MTU, a
 * write past MTU − 3 can be truncated rather than rejected on some platforms,
 * and the firmware does not serve queued writes — so every write stays at the
 * floor, the same fallback the native backend uses when the platform won't
 * report a write limit. */
export const BLE_SAFE_WRITE = 20;

export async function requestRynkBluetoothDevice(): Promise<BluetoothDevice> {
  // The chooser matches service filters against ADVERTISEMENT data, and the
  // firmware's host advertisement carries only the 16-bit HID and Battery
  // UUIDs (HID is blocklisted as a Web Bluetooth filter), never the 128-bit
  // Rynk UUID — a Rynk service filter matches nothing, ever. Let the user
  // pick by name instead; optionalServices is what grants GATT access to the
  // service after connecting.
  return navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [RYNK_SERVICE_UUID],
  });
}

/** Devices this origin already holds a permission grant for. A granted
 * keyboard needs no chooser and no advertising — gatt.connect() reaches it
 * even while it is busy being a keyboard, over that same connection. Empty
 * on browsers without persistent Web Bluetooth permissions. */
export async function grantedRynkDevices(): Promise<BluetoothDevice[]> {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth.getDevices) return [];
  try {
    return await bluetooth.getDevices();
  } catch {
    return [];
  }
}

export async function bluetoothByteLink(device: BluetoothDevice): Promise<RynkByteLink> {
  if (!device.gatt) throw new Error("The selected Bluetooth device does not expose GATT");

  const buffer = new RynkFrameBuffer();
  let ended = false;
  let released = false;
  // Web Bluetooth allows one outstanding GATT operation per device, so every
  // write (and the teardown unsubscribe) goes through this chain. It also
  // keeps the chunks of concurrent frames from interleaving in the stream.
  let ops: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const result = ops.then(op);
    ops = result.catch(() => undefined);
    return result;
  };

  const onDisconnected = () => {
    ended = true;
    buffer.end();
  };
  device.addEventListener("gattserverdisconnected", onDisconnected);

  let output: BluetoothRemoteGATTCharacteristic;
  let input: BluetoothRemoteGATTCharacteristic;
  const onNotify = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    // Chromium reuses the DataView's backing buffer across notifications.
    if (value) buffer.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice());
  };
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(RYNK_SERVICE_UUID);
    [input, output] = await Promise.all([
      service.getCharacteristic(RYNK_INPUT_CHAR_UUID),
      service.getCharacteristic(RYNK_OUTPUT_CHAR_UUID),
    ]);
    input.addEventListener("characteristicvaluechanged", onNotify);
    // Both characteristics are encrypted-only, so on an unbonded link this
    // subscription is what makes the platform run its pairing flow.
    await input.startNotifications();
  } catch (error) {
    device.removeEventListener("gattserverdisconnected", onDisconnected);
    device.gatt.disconnect();
    throw error;
  }

  const end = () => {
    ended = true;
    buffer.end();
  };

  return {
    label: bluetoothLabel(device),
    send(bytes) {
      return enqueue(async () => {
        if (ended) throw new Error("Bluetooth link is closed");
        for (let offset = 0; offset < bytes.length; offset += BLE_SAFE_WRITE) {
          await output.writeValueWithoutResponse(bytes.slice(offset, offset + BLE_SAFE_WRITE));
        }
      });
    },
    recv: () => buffer.recv(),
    async close() {
      if (released) return;
      released = true;
      end();
      input.removeEventListener("characteristicvaluechanged", onNotify);
      device.removeEventListener("gattserverdisconnected", onDisconnected);
      await enqueue(() => input.stopNotifications()).catch(() => undefined);
      device.gatt?.disconnect();
    },
    end,
  };
}

function bluetoothLabel(device: BluetoothDevice): string {
  const name = device.name?.trim();
  return name ? `${name} (Web Bluetooth)` : "Rynk (Web Bluetooth)";
}
