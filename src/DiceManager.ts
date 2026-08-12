import { EventEmitter } from './EventEmitter.js';
import { Pixel } from './Pixel.js';
import { StorageAdapter, KnownDie, DiceManagerEvents } from './types.js';
import {
  PIXELS_SERVICE_UUID,
  PIXELS_LEGACY_SERVICE_UUID,
} from './ble/constants.js';
import { startMonitoring, stopMonitoring } from './reconnection/monitor.js';
import { attemptReconnection } from './reconnection/strategy.js';

export class DiceManager extends EventEmitter<DiceManagerEvents> {
  private readonly storage: StorageAdapter;
  private readonly diceMap = new Map<string, Pixel>();

  constructor(storage: StorageAdapter) {
    super();
    this.storage = storage;
  }

  get dice(): ReadonlyMap<string, Pixel> {
    return this.diceMap;
  }

  get connectedDice(): Pixel[] {
    return [...this.diceMap.values()].filter((pixel) => pixel.isConnected);
  }

  getPixel(systemId: string): Pixel | undefined {
    return this.diceMap.get(systemId);
  }

  async requestPixel(): Promise<Pixel> {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [PIXELS_SERVICE_UUID] },
        { services: [PIXELS_LEGACY_SERVICE_UUID] },
        { namePrefix: 'Pixel' },
      ],
      optionalServices: [PIXELS_SERVICE_UUID, PIXELS_LEGACY_SERVICE_UUID],
    });

    const existing = this.diceMap.get(device.id);
    if (existing) {
      if (!existing.isConnected) {
        await existing.connect();
        startMonitoring(existing);
      }
      return existing;
    }

    const pixel = new Pixel(device);
    await pixel.connect();
    startMonitoring(pixel);
    this.wirePixelEvents(pixel);
    this.diceMap.set(pixel.systemId, pixel);
    this.emit('dieAdded', pixel);
    await this.persistDice();
    return pixel;
  }

  async connectKnownDevices(): Promise<void> {
    const devices = await navigator.bluetooth.getDevices();

    for (const device of devices) {
      if (this.diceMap.get(device.id)?.isConnected) {
        continue;
      }

      this.watchForAdvertisement(device);
    }
  }

  async reconnect(systemId: string): Promise<void> {
    const pixel = this.diceMap.get(systemId);
    if (!pixel) {
      throw new Error(`No known die with systemId: ${systemId}`);
    }

    await attemptReconnection(pixel.device, pixel);
  }

  async forget(systemId: string): Promise<void> {
    const pixel = this.diceMap.get(systemId);
    if (!pixel) {
      return;
    }

    if (pixel.isConnected) {
      await pixel.disconnect();
    }
    stopMonitoring(pixel);

    if (typeof pixel.device.forget === 'function') {
      await pixel.device.forget();
    }

    this.diceMap.delete(systemId);
    this.emit('dieRemoved', pixel);

    const existing = await this.storage.load();
    const filtered = existing.filter((die) => die.systemId !== systemId);
    await this.storage.save(filtered);
  }

  private wirePixelEvents(pixel: Pixel): void {
    pixel.addEventListener('battery', ({ level }) => {
      this.emit('dieBatteryUpdate', { pixel, level });
    });

    pixel.addEventListener('status', ({ connected }) => {
      if (connected) {
        this.emit('dieConnected', pixel);
      } else {
        this.emit('dieDisconnected', pixel);
      }
    });
  }

  private watchForAdvertisement(device: BluetoothDevice): void {
    const controller = new AbortController();

    const onAdvertisement = (): void => {
      controller.abort();
      device.removeEventListener('advertisementreceived', onAdvertisement);
      this.connectDevice(device).catch(() => {
        // Connection failed after advertisement — die may have gone back to sleep
      });
    };

    device.addEventListener('advertisementreceived', onAdvertisement);
    device.watchAdvertisements({ signal: controller.signal }).catch(() => {
      // Device may not support watchAdvertisements — silently skip
    });
  }

  private async connectDevice(device: BluetoothDevice): Promise<void> {
    let pixel = this.diceMap.get(device.id);
    const isNew = !pixel;

    if (!pixel) {
      pixel = new Pixel(device);
      this.wirePixelEvents(pixel);
      this.diceMap.set(pixel.systemId, pixel);
    }

    await pixel.connect();
    startMonitoring(pixel);

    if (isNew) {
      this.emit('dieAdded', pixel);
      await this.persistDice();
    }
  }

  private async persistDice(): Promise<void> {
    const existing = await this.storage.load();
    const mergedById = new Map(existing.map((die) => [die.systemId, die]));
    const mergedByName = new Map(existing.map((die) => [die.name, die]));

    for (const pixel of this.diceMap.values()) {
      const entry = {
        name: pixel.name,
        systemId: pixel.systemId,
        dieType: pixel.dieType,
        lastConnected: Date.now(),
      };

      // Remove stale entry if the same name exists with a different systemId
      const existingByName = mergedByName.get(pixel.name);
      if (existingByName && existingByName.systemId !== pixel.systemId) {
        mergedById.delete(existingByName.systemId);
      }

      mergedById.set(pixel.systemId, entry);
      mergedByName.set(pixel.name, entry);
    }

    await this.storage.save([...mergedById.values()]);
  }
}
