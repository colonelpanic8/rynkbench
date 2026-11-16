/** Human-readable labels for the transport/workspace behind a session. */
export const KIND_LABEL: Record<string, string> = {
  offline: "File",
  mock: "Mock",
  webhid: "USB · HID",
  webserial: "USB · Serial",
  webbluetooth: "Bluetooth",
  native: "Native",
  nativeble: "Bluetooth · Native",
};

/** Why a way of connecting cannot work here, and what would make it work.
 *  Shown on the connect screen instead of a greyed-out card. */
export const UNAVAILABLE_REASON: Record<string, string> = {
  native: "needs the Rynkbench desktop app",
  nativeble: "needs the Rynkbench desktop app",
  webhid: "needs Chrome or Edge on a computer",
  webserial: "needs Chrome or Edge on a computer",
  webbluetooth: "needs Chrome or Edge",
  mock: "is off in this build",
};
