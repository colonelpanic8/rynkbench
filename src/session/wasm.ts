// One-shot loader for the vendored rynk-wasm module, shared by every backend
// that drives the wasm client (WebHID, native Tauri).

import wasmInit from "../vendor/rynk-wasm/rynk_wasm";

let wasmReady: Promise<unknown> | null = null;

export function initWasm(): Promise<unknown> {
  wasmReady ??= wasmInit().catch((error: unknown) => {
    wasmReady = null; // failed init is retryable on the next connect
    throw error;
  });
  return wasmReady;
}
