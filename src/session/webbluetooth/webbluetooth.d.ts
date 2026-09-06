// Minimal ambient Web Bluetooth declarations — just the surface this backend
// uses. TypeScript's DOM library does not currently include Web Bluetooth.

interface BluetoothLEScanFilter {
  services?: string[];
}

interface BluetoothRequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  addEventListener(type: "characteristicvaluechanged", listener: (event: Event) => void): void;
  removeEventListener(type: "characteristicvaluechanged", listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: "gattserverdisconnected", listener: (event: Event) => void): void;
  removeEventListener(type: "gattserverdisconnected", listener: (event: Event) => void): void;
}

interface Bluetooth extends EventTarget {
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  readonly bluetooth: Bluetooth;
}
