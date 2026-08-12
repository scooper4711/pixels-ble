import { describe, it, expect, vi } from 'vitest';
import { Pixel } from './Pixel.js';
import {
  MESSAGE_TYPE_I_AM_A_DIE,
  MESSAGE_TYPE_ROLL_STATE,
  MESSAGE_TYPE_BATTERY_LEVEL,
  MESSAGE_TYPE_RSSI,
  ROLL_EVENT_SETTLED,
  DIE_TYPE_FACES,
} from './ble/constants.js';

// --- Helpers ---

function createMinimalDevice(
  overrides: Partial<{ id: string; name: string | null }> = {},
): BluetoothDevice {
  return {
    id: overrides.id ?? 'test-device-id',
    name: overrides.name !== undefined ? overrides.name : 'Test Pixel',
    gatt: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    watchAdvertisements: vi.fn(),
    forget: vi.fn(),
  } as unknown as BluetoothDevice;
}

function createNotificationDataView(bytes: number[]): DataView {
  const buffer = new Uint8Array(bytes).buffer;
  return new DataView(buffer);
}

function createNotificationEvent(bytes: number[]): Event {
  const dataView = createNotificationDataView(bytes);
  return {
    target: { value: dataView },
  } as unknown as Event;
}

/**
 * Access the private handleNotification method via the bound reference.
 * We reach it through the class prototype — the bound handler is stored
 * as a property on the instance.
 */
function getHandleNotification(pixel: Pixel): (event: Event) => void {
  // The handleNotification is a bound property (arrow function in class field)
  // Access it through the instance's own properties
  return (pixel as any).handleNotification;
}

// --- Constructor Tests ---

describe('Pixel constructor', () => {
  it('uses device.id as systemId', () => {
    const device = createMinimalDevice({ id: 'abc-123' });
    const pixel = new Pixel(device);

    expect(pixel.systemId).toBe('abc-123');
  });

  it('uses device.name when no knownInfo provided', () => {
    const device = createMinimalDevice({ name: 'My D20' });
    const pixel = new Pixel(device);

    expect(pixel.name).toBe('My D20');
  });

  it('uses knownInfo.name when provided', () => {
    const device = createMinimalDevice({ name: 'Device Name' });
    const pixel = new Pixel(device, { name: 'Known Name' });

    expect(pixel.name).toBe('Known Name');
  });

  it('falls back to Unknown Pixel when both are missing', () => {
    const device = createMinimalDevice({ name: null });
    const pixel = new Pixel(device);

    expect(pixel.name).toBe('Unknown Pixel');
  });

  it('sets dieType from knownInfo when provided', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device, { dieType: 20 });

    expect(pixel.dieType).toBe(20);
  });

  it('dieType defaults to null', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    expect(pixel.dieType).toBeNull();
  });

  it('isConnected starts as false', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    expect(pixel.isConnected).toBe(false);
  });

  it('batteryLevel starts as null', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    expect(pixel.batteryLevel).toBeNull();
  });
});

// --- processNotification Tests ---

describe('Pixel processNotification', () => {
  it('IAmADie message updates dieType', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);

    // IAmADie: type=2, then padding bytes, dieType enum at offset 3 = 7 (D20 = 20 faces)
    const bytes = new Array(21).fill(0);
    bytes[0] = MESSAGE_TYPE_I_AM_A_DIE;
    bytes[3] = 7; // D20 enum value
    bytes[20] = 85; // battery level

    handler(createNotificationEvent(bytes));

    expect(pixel.dieType).toBe(DIE_TYPE_FACES[7]);
  });

  it('IAmADie message with battery emits battery event', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);
    const batteryListener = vi.fn();
    pixel.addEventListener('battery', batteryListener);

    const bytes = new Array(21).fill(0);
    bytes[0] = MESSAGE_TYPE_I_AM_A_DIE;
    bytes[3] = 7;
    bytes[20] = 75;

    handler(createNotificationEvent(bytes));

    expect(batteryListener).toHaveBeenCalledWith({ level: 75 });
  });

  it('BatteryLevel message updates batteryLevel and emits battery', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);
    const batteryListener = vi.fn();
    pixel.addEventListener('battery', batteryListener);

    // BatteryLevel: type=34, level at offset 1
    handler(createNotificationEvent([MESSAGE_TYPE_BATTERY_LEVEL, 92]));

    expect(pixel.batteryLevel).toBe(92);
    expect(batteryListener).toHaveBeenCalledWith({ level: 92 });
  });

  it('unknown message type does not emit anything', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);
    const rollListener = vi.fn();
    const batteryListener = vi.fn();
    pixel.addEventListener('roll', rollListener);
    pixel.addEventListener('battery', batteryListener);

    handler(createNotificationEvent([255, 0, 0])); // unknown type 255

    expect(rollListener).not.toHaveBeenCalled();
    expect(batteryListener).not.toHaveBeenCalled();
  });

  it('null value in event is silently ignored', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);

    const event = { target: { value: null } } as unknown as Event;

    expect(() => handler(event)).not.toThrow();
  });
});

// --- handleRollState / hasMoved state machine ---

describe('Pixel hasMoved state machine', () => {
  function createPixelWithDieType(dieTypeEnum: number): {
    pixel: Pixel;
    handler: (event: Event) => void;
  } {
    const device = createMinimalDevice();
    const pixel = new Pixel(device, { dieType: DIE_TYPE_FACES[dieTypeEnum] });
    const handler = getHandleNotification(pixel);
    return { pixel, handler };
  }

  function rollStateEvent(event: number, faceIndex: number): Event {
    return createNotificationEvent([MESSAGE_TYPE_ROLL_STATE, event, faceIndex]);
  }

  it('first settled event with hasMoved=false does NOT emit roll', () => {
    const { pixel, handler } = createPixelWithDieType(7); // D20
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    handler(rollStateEvent(ROLL_EVENT_SETTLED, 5));

    expect(rollListener).not.toHaveBeenCalled();
  });

  it('non-settled event with hasMoved=false sets hasMoved=true (no emission)', () => {
    const { pixel, handler } = createPixelWithDieType(7);
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    // event=2 means "rolling" (not settled)
    handler(rollStateEvent(2, 0));

    expect(rollListener).not.toHaveBeenCalled();
  });

  it('settled event with hasMoved=true emits roll with correct face value', () => {
    const { pixel, handler } = createPixelWithDieType(7); // D20
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    // First: non-settled event sets hasMoved=true
    handler(rollStateEvent(2, 0));
    // Then: settled event triggers roll
    handler(rollStateEvent(ROLL_EVENT_SETTLED, 14));

    // D20: faceIndex + 1 = 15
    expect(rollListener).toHaveBeenCalledWith({ face: 15, dieType: 20 });
  });

  it('after a roll is emitted, hasMoved resets to false', () => {
    const { pixel, handler } = createPixelWithDieType(7);
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    // Trigger first roll
    handler(rollStateEvent(2, 0)); // hasMoved = true
    handler(rollStateEvent(ROLL_EVENT_SETTLED, 5)); // emits, resets hasMoved

    // Another settled without movement should NOT emit
    handler(rollStateEvent(ROLL_EVENT_SETTLED, 10));

    expect(rollListener).toHaveBeenCalledTimes(1);
  });

  it('multiple non-settled events do not cause multiple rolls', () => {
    const { pixel, handler } = createPixelWithDieType(7);
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    handler(rollStateEvent(2, 0));
    handler(rollStateEvent(3, 1));
    handler(rollStateEvent(4, 2));
    handler(rollStateEvent(ROLL_EVENT_SETTLED, 19));

    // Only one roll emitted at settle
    expect(rollListener).toHaveBeenCalledTimes(1);
    // D20: faceIndex 19 + 1 = 20
    expect(rollListener).toHaveBeenCalledWith({ face: 20, dieType: 20 });
  });

  it('face value conversion is applied correctly for d20: face 19 → 20', () => {
    const { pixel, handler } = createPixelWithDieType(7);
    const rollListener = vi.fn();
    pixel.addEventListener('roll', rollListener);

    handler(rollStateEvent(2, 0)); // movement
    handler(rollStateEvent(ROLL_EVENT_SETTLED, 19));

    expect(rollListener).toHaveBeenCalledWith({ face: 20, dieType: 20 });
  });
});

// --- blink error ---

describe('Pixel blink', () => {
  it('throws Not connected error when not connected', async () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    await expect(pixel.blink({ r: 255, g: 0, b: 0 })).rejects.toThrow(
      'Not connected',
    );
  });
});

// --- reportRssi error ---

describe('Pixel reportRssi', () => {
  it('throws Not connected error when not connected', async () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    await expect(pixel.reportRssi(true, 5000)).rejects.toThrow(
      'Not connected',
    );
  });
});

// --- RSSI notification ---

describe('Pixel RSSI notification', () => {
  it('updates rssi property and emits rssi event', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const handler = getHandleNotification(pixel);
    const rssiListener = vi.fn();
    pixel.addEventListener('rssi', rssiListener);

    // RSSI message: type=36, value=-72 (as uint8 = 184)
    handler(createNotificationEvent([MESSAGE_TYPE_RSSI, 184]));

    expect(pixel.rssi).toBe(-72);
    expect(rssiListener).toHaveBeenCalledWith({ rssi: -72 });
  });

  it('rssi starts as null', () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    expect(pixel.rssi).toBeNull();
  });
});

// --- connect error ---

describe('Pixel connect', () => {
  it('throws when device has no GATT', async () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);

    await expect(pixel.connect()).rejects.toThrow('Device does not support GATT');
  });
});

// --- disconnect ---

describe('Pixel disconnect', () => {
  it('after disconnect on never-connected Pixel, isConnected is false and status event emits', async () => {
    const device = createMinimalDevice();
    const pixel = new Pixel(device);
    const statusListener = vi.fn();
    pixel.addEventListener('status', statusListener);

    await pixel.disconnect();

    expect(pixel.isConnected).toBe(false);
    expect(statusListener).toHaveBeenCalledWith({ connected: false });
  });
});
