// Modern Pixels dice UUIDs
export const PIXELS_SERVICE_UUID = 'a6b90001-7a5a-43f2-a962-350c8edc9b5b';
export const PIXELS_NOTIFY_CHARACTERISTIC = 'a6b90002-7a5a-43f2-a962-350c8edc9b5b';
export const PIXELS_WRITE_CHARACTERISTIC = 'a6b90003-7a5a-43f2-a962-350c8edc9b5b';

// Legacy Pixels dice UUIDs (for older dice)
export const PIXELS_LEGACY_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const PIXELS_LEGACY_NOTIFY_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
export const PIXELS_LEGACY_WRITE_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// Incoming message types (notifications from die)
export const MESSAGE_TYPE_I_AM_A_DIE = 2;
export const MESSAGE_TYPE_ROLL_STATE = 3;
export const MESSAGE_TYPE_BATTERY_LEVEL = 34;
export const MESSAGE_TYPE_RSSI = 36;

// Outgoing message types (commands to die)
export const MESSAGE_TYPE_WHO_ARE_YOU = 1;
export const MESSAGE_TYPE_REQUEST_BATTERY_LEVEL = 33;
export const MESSAGE_TYPE_BLINK = 29;
export const MESSAGE_TYPE_REQUEST_RSSI = 35;

// Blink constants
export const FACE_MASK_ALL = 0xffffffff;

// Die type enum from IAmADie message → face count
export const DIE_TYPE_FACES: Record<number, number> = {
  0: 0, // Unknown
  1: 4, // D4
  2: 6, // D6
  3: 8, // D8
  4: 10, // D10
  5: 100, // D00 (percentile)
  6: 12, // D12
  7: 20, // D20
  8: 6, // D6 Pipped
  9: 6, // D6 Fudge
};

// Roll state events
export const ROLL_EVENT_SETTLED = 1;
