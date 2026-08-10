import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStrategy,
  resetStrategy,
  attemptReconnection,
  attemptPollReconnection,
  performGattReconnection,
} from './strategy.js';
import { Pixel } from '../Pixel.js';

// Suppress unhandled rejection noise from intentionally-failing reconnection chains
const noop = (): void => {};
const originalListeners = process.listeners('unhandledRejection');
beforeEach(() => {
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', noop);
});
afterEach(() => {
  process.removeAllListeners('unhandledRejection');
  for (const listener of originalListeners) {
    process.on('unhandledRejection', listener as (...args: any[]) => void);
  }
});

// --- Helpers ---

function createMockDevice(
  overrides: Partial<{
    gattConnected: boolean;
    connectRejects: boolean;
    watchRejects: boolean;
  }> = {},
): BluetoothDevice {
  const { gattConnected = false, connectRejects = true, watchRejects = true } = overrides;

  return {
    id: 'test-device',
    name: 'Test Pixel',
    gatt: {
      connect: connectRejects
        ? vi.fn().mockRejectedValue(new Error('connect failed'))
        : vi.fn().mockImplementation(function (this: any) {
            this.connected = true;
            return Promise.resolve(this);
          }),
      disconnect: vi.fn(),
      connected: gattConnected,
      getPrimaryService: vi.fn().mockRejectedValue(new Error('no service')),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    watchAdvertisements: watchRejects
      ? vi.fn().mockRejectedValue(new Error('not supported'))
      : vi.fn().mockResolvedValue(undefined),
    forget: vi.fn(),
  } as unknown as BluetoothDevice;
}

function createPixelFromDevice(device: BluetoothDevice): Pixel {
  return new Pixel(device);
}

// --- Tests ---

describe('strategy state', () => {
  beforeEach(() => {
    resetStrategy();
  });

  it('getStrategy returns unknown initially', () => {
    expect(getStrategy()).toBe('unknown');
  });

  it('resetStrategy resets to unknown after change', async () => {
    const device = createMockDevice({ watchRejects: true });
    const pixel = createPixelFromDevice(device);

    vi.useFakeTimers();

    // This will fail (watch rejects → poll rejects after retries)
    const promise = attemptReconnection(device, pixel).catch(() => {});
    // Advance past all backoff delays
    await vi.runAllTimersAsync();
    await promise;

    // Strategy should have been set to 'poll' during the attempt
    expect(getStrategy()).toBe('poll');

    resetStrategy();
    expect(getStrategy()).toBe('unknown');

    vi.useRealTimers();
  });
});

describe('attemptReconnection routing', () => {
  beforeEach(() => {
    resetStrategy();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('with strategy unknown tries watch first, falls back to poll, sets strategy to poll', async () => {
    const device = createMockDevice({ watchRejects: true });
    const pixel = createPixelFromDevice(device);

    const promise = attemptReconnection(device, pixel).catch(() => {});

    // watchAdvertisements rejects → falls to poll → poll connect fails with backoff
    await vi.runAllTimersAsync();
    await promise;

    // Strategy updated to poll because watch failed
    expect(getStrategy()).toBe('poll');
    expect(device.watchAdvertisements).toHaveBeenCalled();
  });

  it('with strategy poll goes straight to poll', async () => {
    // First set strategy to poll by doing a failed attempt
    const device = createMockDevice({ watchRejects: true });
    const pixel = createPixelFromDevice(device);

    const firstAttempt = attemptReconnection(device, pixel).catch(() => {});
    await vi.runAllTimersAsync();
    await firstAttempt;

    expect(getStrategy()).toBe('poll');

    // Reset the mock call counts
    (device.watchAdvertisements as ReturnType<typeof vi.fn>).mockClear();

    // Second attempt — should skip watch entirely
    const secondAttempt = attemptReconnection(device, pixel).catch(() => {});
    await vi.runAllTimersAsync();
    await secondAttempt;

    expect(device.watchAdvertisements).not.toHaveBeenCalled();
  });
});

describe('performGattReconnection', () => {
  it('disconnects stale GATT before connecting', async () => {
    const device = createMockDevice({ gattConnected: true, connectRejects: true });
    const pixel = createPixelFromDevice(device);

    vi.useFakeTimers();

    // It will reject because connect fails, but it should disconnect first
    const promise = performGattReconnection(device, pixel).catch(() => {});
    await vi.runAllTimersAsync();
    await promise;

    expect(device.gatt!.disconnect).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('calls pixel.connect() and pixel.startConnectionMonitoring()', async () => {
    // Create a device where GATT connect succeeds and service discovery succeeds
    const notifyChar = {
      startNotifications: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      value: null,
    };
    const writeChar = {
      writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const service = {
      getCharacteristic: vi.fn().mockImplementation((uuid: string) => {
        if (uuid.endsWith('9b5b')) {
          // Matches write or notify by the last part
          // Return notify for first call, write for second
        }
        return Promise.resolve(notifyChar);
      }),
    };

    const device = {
      id: 'connected-device',
      name: 'Test Pixel',
      gatt: {
        connect: vi.fn().mockImplementation(function (this: any) {
          this.connected = true;
          return Promise.resolve(this);
        }),
        disconnect: vi.fn(),
        connected: false,
        getPrimaryService: vi.fn().mockResolvedValue({
          getCharacteristic: vi.fn()
            .mockResolvedValueOnce(notifyChar)
            .mockResolvedValueOnce(writeChar),
        }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      watchAdvertisements: vi.fn().mockResolvedValue(undefined),
      forget: vi.fn(),
    } as unknown as BluetoothDevice;

    const pixel = new Pixel(device);
    const connectSpy = vi.spyOn(pixel, 'connect');
    const monitorSpy = vi.spyOn(pixel, 'startConnectionMonitoring');

    await performGattReconnection(device, pixel);

    expect(connectSpy).toHaveBeenCalled();
    expect(monitorSpy).toHaveBeenCalled();
  });
});

describe('attemptPollReconnection backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws after exhausting all retry attempts', async () => {
    const device = createMockDevice({ connectRejects: true });
    const pixel = createPixelFromDevice(device);

    const promise = attemptPollReconnection(device, pixel);

    // Advance timers iteratively to flush each backoff step
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }

    await expect(promise).rejects.toThrow('Poll reconnection failed after 5 attempts');
  });
});
