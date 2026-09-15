import type { FirmwareReleaseAsset } from "./releases";

interface PreparedFirmware {
  token: string;
  size: number;
}

function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const tauri = typeof window === "undefined" ? undefined : window.__TAURI__;
  if (!tauri) throw new Error("Automatic firmware installation requires the Rynkbench desktop app");
  return tauri.core.invoke<T>(command, args);
}

export function nativeFirmwareInstallerAvailable(): boolean {
  return typeof window !== "undefined" && window.__TAURI__ !== undefined;
}

export function prepareFirmware(
  asset: FirmwareReleaseAsset,
  familyId: number,
): Promise<PreparedFirmware> {
  return invoke("firmware_prepare", {
    request: {
      url: asset.url,
      fileName: asset.name,
      sha256: asset.sha256,
      familyId,
      expectedSize: asset.size,
      archiveEntryPattern: asset.archiveEntryPattern,
    },
  });
}

export function installPreparedFirmware(
  token: string,
  volumeLabels: readonly string[],
): Promise<void> {
  return invoke("firmware_install", {
    request: {
      token,
      volumeLabels,
      timeoutMs: 45_000,
    },
  });
}
