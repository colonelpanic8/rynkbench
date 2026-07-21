// Minimal ambient WebHID declarations — just what this backend uses.
// (tsconfig lib "DOM" does not ship WebHID, and the project deliberately
// avoids a @types/w3c-web-hid dependency.)

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

interface HIDCollectionInfo {
  readonly usagePage: number;
  readonly usage: number;
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: readonly HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(
    type: "inputreport",
    listener: (this: HIDDevice, ev: HIDInputReportEvent) => void,
  ): void;
  removeEventListener(
    type: "inputreport",
    listener: (this: HIDDevice, ev: HIDInputReportEvent) => void,
  ): void;
}

interface HID extends EventTarget {
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
  getDevices(): Promise<HIDDevice[]>;
  addEventListener(type: "disconnect", listener: (ev: { device: HIDDevice }) => void): void;
  removeEventListener(type: "disconnect", listener: (ev: { device: HIDDevice }) => void): void;
}

interface Navigator {
  readonly hid: HID;
}
