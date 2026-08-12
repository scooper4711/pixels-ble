import { EventEmitter } from './EventEmitter.js';
import { PixelEvents } from './types.js';
import {
  PIXELS_SERVICE_UUID,
  PIXELS_NOTIFY_CHARACTERISTIC,
  PIXELS_WRITE_CHARACTERISTIC,
  PIXELS_LEGACY_SERVICE_UUID,
  PIXELS_LEGACY_NOTIFY_CHARACTERISTIC,
  PIXELS_LEGACY_WRITE_CHARACTERISTIC,
  ROLL_EVENT_SETTLED,
} from './ble/constants.js';
import {
  parseMessage,
  convertFaceValue,
  serializeWhoAreYou,
  serializeBlink,
  serializeRequestBatteryLevel,
  serializeRequestRssi,
} from './ble/protocol.js';

const SERVICE_PAIRS = [
  {
    service: PIXELS_SERVICE_UUID,
    notify: PIXELS_NOTIFY_CHARACTERISTIC,
    write: PIXELS_WRITE_CHARACTERISTIC,
  },
  {
    service: PIXELS_LEGACY_SERVICE_UUID,
    notify: PIXELS_LEGACY_NOTIFY_CHARACTERISTIC,
    write: PIXELS_LEGACY_WRITE_CHARACTERISTIC,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MONITOR_INTERVAL_MS = 30_000;
const BATTERY_POLL_INTERVAL = 10; // every 10th check = 5 minutes

interface KnownPixelInfo {
  dieType?: number;
  name?: string;
}

export class Pixel extends EventEmitter<PixelEvents> {
  readonly systemId: string;
  readonly name: string;

  dieType: number | null;
  batteryLevel: number | null = null;
  rssi: number | null = null;
  isConnected = false;

  private readonly _device: BluetoothDevice;
  private server: BluetoothRemoteGATTServer | null = null;
  private notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private hasMoved = false;
  private batteryPollCounter = 0;

  private readonly handleNotification = (event: Event): void => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const data = characteristic.value;
    if (!data) return;
    this.processNotification(data);
  };

  constructor(device: BluetoothDevice, knownInfo?: KnownPixelInfo) {
    super();
    this._device = device;
    this.systemId = device.id;
    this.name = knownInfo?.name ?? device.name ?? 'Unknown Pixel';
    this.dieType = knownInfo?.dieType ?? null;
  }

  get device(): BluetoothDevice {
    return this._device;
  }

  async connect(timeoutMs?: number): Promise<void> {
    const gatt = this._device.gatt;
    if (!gatt) {
      throw new Error('Device does not support GATT');
    }

    const connectPromise = gatt.connect();
    const server = timeoutMs
      ? await withTimeout(connectPromise, timeoutMs)
      : await connectPromise;

    this.server = server;
    await sleep(500); // Allow GATT service enumeration to complete

    const { notifyChar, writeChar } = await this.discoverCharacteristics(server);
    this.notifyCharacteristic = notifyChar;
    this.writeCharacteristic = writeChar;

    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged', this.handleNotification);

    const whoAreYou = serializeWhoAreYou();
    await this.writeCharacteristic.writeValueWithoutResponse(
      toArrayBuffer(whoAreYou),
    );

    this.isConnected = true;
    this.emit('status', { connected: true });
  }

  async disconnect(): Promise<void> {
    if (this.notifyCharacteristic) {
      this.notifyCharacteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleNotification,
      );
      this.notifyCharacteristic = null;
    }

    this.stopConnectionMonitoring();

    if (this._device.gatt?.connected) {
      this._device.gatt.disconnect();
    }

    this.server = null;
    this.writeCharacteristic = null;
    this.isConnected = false;
    this.emit('status', { connected: false });
  }

  async blink(color: { r: number; g: number; b: number }): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Not connected — cannot send blink command');
    }

    const colorInt = (color.r << 16) | (color.g << 8) | color.b;
    const data = serializeBlink(colorInt, 1, 1000);
    await this.writeCharacteristic.writeValueWithoutResponse(
      toArrayBuffer(data),
    );
  }

  async reportRssi(enabled: boolean, intervalMs = 5000): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Not connected — cannot send RSSI request');
    }

    const data = serializeRequestRssi(enabled, intervalMs);
    await this.writeCharacteristic.writeValueWithoutResponse(
      toArrayBuffer(data),
    );
  }

  startConnectionMonitoring(): void {
    if (this.monitorInterval) return;

    this.batteryPollCounter = 0;
    this.monitorInterval = setInterval(() => {
      this.checkConnection();
    }, MONITOR_INTERVAL_MS);
  }

  stopConnectionMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private checkConnection(): void {
    if (!this._device.gatt?.connected) {
      this.isConnected = false;
      this.emit('status', { connected: false });
      this.stopConnectionMonitoring();
      return;
    }

    this.batteryPollCounter++;
    if (this.batteryPollCounter >= BATTERY_POLL_INTERVAL) {
      this.batteryPollCounter = 0;
      this.requestBatteryLevel();
    }
  }

  private requestBatteryLevel(): void {
    if (!this.writeCharacteristic) return;
    const batteryCmd = serializeRequestBatteryLevel();
    this.writeCharacteristic
      .writeValueWithoutResponse(toArrayBuffer(batteryCmd))
      .catch(() => {
        // Silently ignore — connection monitor will detect disconnect
      });
  }

  private async discoverCharacteristics(
    server: BluetoothRemoteGATTServer,
  ): Promise<{
    notifyChar: BluetoothRemoteGATTCharacteristic;
    writeChar: BluetoothRemoteGATTCharacteristic;
  }> {
    // First pass: try exact UUIDs (fastest path)
    for (const pair of SERVICE_PAIRS) {
      try {
        const service = await server.getPrimaryService(pair.service);
        const notifyChar = await service.getCharacteristic(pair.notify);
        const writeChar = await service.getCharacteristic(pair.write);
        return { notifyChar, writeChar };
      } catch {
        // Try next service pair
      }
    }

    // Second pass: discover characteristics by property
    for (const pair of SERVICE_PAIRS) {
      try {
        const service = await server.getPrimaryService(pair.service);
        const characteristics = await service.getCharacteristics();

        const notifyChar = characteristics.find(
          (c) => c.properties.notify,
        );
        const writeChar = characteristics.find(
          (c) => c.properties.write || c.properties.writeWithoutResponse,
        );

        if (notifyChar && writeChar) {
          return { notifyChar, writeChar };
        }
      } catch {
        // Try next service pair
      }
    }

    throw new Error('No compatible Pixels service found on device');
  }

  private processNotification(data: DataView): void {
    const message = parseMessage(data);

    switch (message.type) {
      case 'iAmADie':
        this.dieType = message.dieType;
        if (message.batteryLevel !== null) {
          this.batteryLevel = message.batteryLevel;
          this.emit('battery', { level: message.batteryLevel });
        }
        break;

      case 'rollState':
        this.handleRollState(message.event, message.faceIndex);
        break;

      case 'batteryLevel':
        this.batteryLevel = message.level;
        this.emit('battery', { level: message.level });
        break;

      case 'rssi':
        this.rssi = message.rssi;
        this.emit('rssi', { rssi: message.rssi });
        break;
    }
  }

  private handleRollState(event: number, faceIndex: number): void {
    if (event !== ROLL_EVENT_SETTLED && !this.hasMoved) {
      this.hasMoved = true;
      return;
    }

    if (event === ROLL_EVENT_SETTLED && this.hasMoved) {
      this.hasMoved = false;
      const dieType = this.dieType ?? 0;
      const face = convertFaceValue(faceIndex, dieType);
      this.emit('roll', { face, dieType });
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/** Converts a Uint8Array to an ArrayBuffer suitable for writeValueWithoutResponse */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
