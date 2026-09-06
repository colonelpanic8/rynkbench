import type { BleStatus, ConnectionStatus } from "../../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../../session/types";
import { isUnsupportedError } from "../../session/unsupported";

interface BleReadback {
  connection: ConnectionStatus | null;
  ble: BleStatus;
}

async function read(session: RynkSession): Promise<BleReadback> {
  try {
    const connection = await session.device.connectionStatus();
    return { connection, ble: connection.ble };
  } catch (error) {
    if (!isUnsupportedError(error)) throw error;
    return { connection: null, ble: await session.device.bleStatus() };
  }
}

/** Profile commands acknowledge queueing; the selected slot can settle later. */
export async function readBleStatus(session: RynkSession, expectedProfile?: number): Promise<BleReadback> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await read(session);
    if (expectedProfile === undefined || status.ble.profile === expectedProfile) return status;
    if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Bluetooth profile ${expectedProfile} did not become active`);
}
