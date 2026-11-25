import type { ConnectionStatus } from "../../model/connection";
import type { RynkSession } from "../../session/types";

/** Profile commands acknowledge queueing; the selected slot can settle later. */
export async function readBleStatus(session: RynkSession, expectedProfile?: number): Promise<ConnectionStatus> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await session.device.connectionStatus();
    if (expectedProfile === undefined || status.selected === expectedProfile) return status;
    if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Bluetooth profile ${expectedProfile} did not become active`);
}
