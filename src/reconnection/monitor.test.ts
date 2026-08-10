import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startMonitoring, stopMonitoring } from './monitor.js';
import { Pixel } from '../Pixel.js';

// --- Helpers ---

function createMockDevice(): BluetoothDevice {
  return {
    id: 'monitor-test-device',
    name: 'Monitor Pixel',
    gatt: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    watchAdvertisements: vi.fn().mockResolvedValue(undefined),
    forget: vi.fn(),
  } as unknown as BluetoothDevice;
}

// --- Tests ---

describe('monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startMonitoring calls pixel.startConnectionMonitoring()', () => {
    const device = createMockDevice();
    const pixel = new Pixel(device);
    const spy = vi.spyOn(pixel, 'startConnectionMonitoring');

    startMonitoring(pixel);

    expect(spy).toHaveBeenCalled();
  });

  it('startMonitoring is idempotent — calling twice does not double-register', () => {
    const device = createMockDevice();
    const pixel = new Pixel(device);
    const spy = vi.spyOn(pixel, 'startConnectionMonitoring');

    startMonitoring(pixel);
    startMonitoring(pixel);

    // startConnectionMonitoring itself is idempotent (checks monitorInterval),
    // but the monitor module also guards with listeners WeakMap
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stopMonitoring calls pixel.stopConnectionMonitoring()', () => {
    const device = createMockDevice();
    const pixel = new Pixel(device);
    const spy = vi.spyOn(pixel, 'stopConnectionMonitoring');

    startMonitoring(pixel);
    stopMonitoring(pixel);

    expect(spy).toHaveBeenCalled();
  });

  it('stopMonitoring removes the status listener', () => {
    const device = createMockDevice();
    const pixel = new Pixel(device);
    const removeSpy = vi.spyOn(pixel, 'removeEventListener');

    startMonitoring(pixel);
    stopMonitoring(pixel);

    expect(removeSpy).toHaveBeenCalledWith('status', expect.any(Function));
  });
});
