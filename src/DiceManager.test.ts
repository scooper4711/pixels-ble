import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiceManager } from './DiceManager.js';
import type { StorageAdapter } from './types.js';
import { PIXELS_SERVICE_UUID, PIXELS_NOTIFY_CHARACTERISTIC, PIXELS_WRITE_CHARACTERISTIC } from './ble/constants.js';

// --- Mock Factories ---

function createMockStorage(): StorageAdapter {
  return {
    load: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCharacteristic(): BluetoothRemoteGATTCharacteristic {
  return {
    startNotifications: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    value: null,
  } as unknown as BluetoothRemoteGATTCharacteristic;
}

function createMockService(): BluetoothRemoteGATTService {
  const notifyChar = createMockCharacteristic();
  const writeChar = createMockCharacteristic();

  return {
    getCharacteristic: vi.fn().mockImplementation((uuid: string) => {
      if (uuid === PIXELS_NOTIFY_CHARACTERISTIC) return Promise.resolve(notifyChar);
      if (uuid === PIXELS_WRITE_CHARACTERISTIC) return Promise.resolve(writeChar);
      return Promise.reject(new Error(`Unknown characteristic: ${uuid}`));
    }),
  } as unknown as BluetoothRemoteGATTService;
}

function createMockGattServer(): BluetoothRemoteGATTServer {
  const service = createMockService();

  return {
    connect: vi.fn().mockImplementation(function (this: BluetoothRemoteGATTServer) {
      (this as any).connected = true;
      return Promise.resolve(this);
    }),
    disconnect: vi.fn(),
    connected: false,
    getPrimaryService: vi.fn().mockResolvedValue(service),
  } as unknown as BluetoothRemoteGATTServer;
}

function createMockDevice(id: string, name: string): BluetoothDevice {
  const gatt = createMockGattServer();

  const device = {
    id,
    name,
    gatt,
    forget: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    watchAdvertisements: vi.fn().mockResolvedValue(undefined),
  } as unknown as BluetoothDevice;

  return device;
}

function stubNavigatorBluetooth(mockDevice: BluetoothDevice): void {
  const bluetooth = {
    requestDevice: vi.fn().mockResolvedValue(mockDevice),
    getDevices: vi.fn().mockResolvedValue([]),
  };

  vi.stubGlobal('navigator', { bluetooth });
}

// --- Tests ---

describe('DiceManager integration', () => {
  let storage: StorageAdapter;
  let manager: DiceManager;
  let mockDevice: BluetoothDevice;

  beforeEach(() => {
    storage = createMockStorage();
    manager = new DiceManager(storage);
    mockDevice = createMockDevice('device-abc-123', 'Pixel D20');
    stubNavigatorBluetooth(mockDevice);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('requestPixel', () => {
    it('creates and connects a new Pixel', async () => {
      const addedEvents: unknown[] = [];
      manager.addEventListener('dieAdded', (info) => addedEvents.push(info));

      const pixel = await manager.requestPixel();

      expect(pixel.systemId).toBe('device-abc-123');
      expect(pixel.isConnected).toBe(true);
      expect(manager.dice.has('device-abc-123')).toBe(true);
      expect(addedEvents).toHaveLength(1);
      expect(storage.save).toHaveBeenCalled();
    });

    it('reuses existing Pixel if already known', async () => {
      const first = await manager.requestPixel();
      const second = await manager.requestPixel();

      expect(first).toBe(second);
      expect(manager.dice.size).toBe(1);
    });
  });

  describe('getPixel', () => {
    it('returns undefined for unknown systemId', () => {
      expect(manager.getPixel('nonexistent-id')).toBeUndefined();
    });

    it('returns the pixel for a known systemId', async () => {
      const pixel = await manager.requestPixel();

      expect(manager.getPixel('device-abc-123')).toBe(pixel);
    });
  });

  describe('forget', () => {
    it('removes die and calls device.forget()', async () => {
      const removedEvents: unknown[] = [];
      manager.addEventListener('dieRemoved', (info) => removedEvents.push(info));

      await manager.requestPixel();
      await manager.forget('device-abc-123');

      expect(manager.dice.has('device-abc-123')).toBe(false);
      expect(removedEvents).toHaveLength(1);
      expect(storage.save).toHaveBeenLastCalledWith([]);
      expect(mockDevice.forget).toHaveBeenCalled();
    });

    it('does nothing for an unknown systemId', async () => {
      await manager.forget('nonexistent-id');

      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('connectedDice', () => {
    it('returns only connected dice', async () => {
      const pixel = await manager.requestPixel();

      expect(manager.connectedDice).toContain(pixel);
      expect(manager.connectedDice).toHaveLength(1);
    });

    it('returns empty array when no dice connected', () => {
      expect(manager.connectedDice).toHaveLength(0);
    });
  });

  describe('connectKnownDevices', () => {
    it('calls getDevices and watches for advertisements', async () => {
      const knownDevice = createMockDevice('known-device-1', 'Pixel D6');
      (navigator.bluetooth.getDevices as ReturnType<typeof vi.fn>).mockResolvedValue([knownDevice]);

      await manager.connectKnownDevices();

      expect(navigator.bluetooth.getDevices).toHaveBeenCalled();
      expect(knownDevice.watchAdvertisements).toHaveBeenCalled();
    });

    it('skips already-connected devices', async () => {
      await manager.requestPixel();

      (navigator.bluetooth.getDevices as ReturnType<typeof vi.fn>).mockResolvedValue([mockDevice]);

      await manager.connectKnownDevices();

      // watchAdvertisements should not be called for an already-connected device
      expect(mockDevice.watchAdvertisements).not.toHaveBeenCalled();
    });
  });

  describe('persistDice deduplication', () => {
    it('deduplicates by name when device ID changes', async () => {
      // First connection with original device ID
      await manager.requestPixel();
      expect(storage.save).toHaveBeenCalled();

      const firstSave = (storage.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstSave).toHaveLength(1);
      expect(firstSave[0].systemId).toBe('device-abc-123');
      expect(firstSave[0].name).toBe('Pixel D20');

      // Simulate storage having the old entry
      (storage.load as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'Pixel D20', systemId: 'old-device-id', dieType: 20, lastConnected: 1000 },
      ]);

      // New device with different ID but same name
      const newDevice = createMockDevice('new-device-id-456', 'Pixel D20');
      stubNavigatorBluetooth(newDevice);

      const manager2 = new DiceManager(storage);
      await manager2.requestPixel();

      const lastSave = (storage.save as ReturnType<typeof vi.fn>).mock.lastCall![0];
      // Should only have one entry (deduplicated), not two
      const pixelD20Entries = lastSave.filter((d: { name: string }) => d.name === 'Pixel D20');
      expect(pixelD20Entries).toHaveLength(1);
      expect(pixelD20Entries[0].systemId).toBe('new-device-id-456');
    });
  });
});
