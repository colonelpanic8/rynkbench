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
