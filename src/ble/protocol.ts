import {
  DIE_TYPE_FACES,
  FACE_MASK_ALL,
  MESSAGE_TYPE_BATTERY_LEVEL,
  MESSAGE_TYPE_BLINK,
  MESSAGE_TYPE_I_AM_A_DIE,
  MESSAGE_TYPE_REQUEST_BATTERY_LEVEL,
  MESSAGE_TYPE_REQUEST_RSSI,
  MESSAGE_TYPE_ROLL_STATE,
  MESSAGE_TYPE_RSSI,
  MESSAGE_TYPE_WHO_ARE_YOU,
} from './constants.js';

// --- Discriminated union for parsed messages ---

export type ParsedMessage =
  | { type: 'iAmADie'; dieType: number; batteryLevel: number | null }
  | { type: 'rollState'; event: number; faceIndex: number }
  | { type: 'batteryLevel'; level: number }
  | { type: 'rssi'; rssi: number }
  | { type: 'unknown'; messageType: number };

// --- Parsing (incoming notifications from die) ---

export function parseIAmADie(data: DataView): {
  dieType: number;
  batteryLevel: number | null;
} {
  const dieTypeEnum = data.getUint8(3);
  const dieType = DIE_TYPE_FACES[dieTypeEnum] ?? 0;
  const batteryLevel = data.byteLength >= 21 ? data.getUint8(20) : null;
  return { dieType, batteryLevel };
}

export function parseRollState(data: DataView): {
  event: number;
  faceIndex: number;
} {
  const event = data.getUint8(1);
  const faceIndex = data.getUint8(2);
  return { event, faceIndex };
}

export function parseBatteryLevel(data: DataView): { level: number } {
  const level = data.getUint8(1);
  return { level };
}

export function parseRssi(data: DataView): { rssi: number } {
  const rssi = data.getInt8(1);
  return { rssi };
}

export function parseMessage(data: DataView): ParsedMessage {
  const messageType = data.getUint8(0);

  switch (messageType) {
    case MESSAGE_TYPE_I_AM_A_DIE: {
      const { dieType, batteryLevel } = parseIAmADie(data);
      return { type: 'iAmADie', dieType, batteryLevel };
    }
    case MESSAGE_TYPE_ROLL_STATE: {
      const { event, faceIndex } = parseRollState(data);
      return { type: 'rollState', event, faceIndex };
    }
    case MESSAGE_TYPE_BATTERY_LEVEL: {
      const { level } = parseBatteryLevel(data);
      return { type: 'batteryLevel', level };
    }
    case MESSAGE_TYPE_RSSI: {
      const { rssi } = parseRssi(data);
      return { type: 'rssi', rssi };
    }
    default:
      return { type: 'unknown', messageType };
  }
}

// --- Face value conversion ---

export function convertFaceValue(faceIndex: number, dieType: number): number {
  if (dieType === 100) {
    return faceIndex === 0 ? 100 : faceIndex * 10;
  }
  if (dieType === 10) {
    return faceIndex === 0 ? 10 : faceIndex;
  }
  return faceIndex + 1;
}

// --- Serialization (outgoing commands to die) ---

export function serializeWhoAreYou(): Uint8Array {
  return new Uint8Array([MESSAGE_TYPE_WHO_ARE_YOU]);
}

export function serializeRequestBatteryLevel(): Uint8Array {
  return new Uint8Array([MESSAGE_TYPE_REQUEST_BATTERY_LEVEL]);
}

export function serializeBlink(
  color: number,
  count: number,
  duration: number,
): Uint8Array {
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);

  view.setUint8(0, MESSAGE_TYPE_BLINK);
  view.setUint8(1, count);
  view.setUint16(2, duration, true);
  view.setUint32(4, color, true);
  view.setUint32(8, FACE_MASK_ALL, true);
  view.setUint8(12, 128); // fade
  view.setUint8(13, 1); // loopCount

  return new Uint8Array(buffer);
}

export function serializeRequestRssi(
  enabled: boolean,
  intervalMs: number,
): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint8(0, MESSAGE_TYPE_REQUEST_RSSI);
  view.setUint8(1, enabled ? 2 : 0); // 0 = off, 2 = repeat
  view.setUint16(2, intervalMs, true);

  return new Uint8Array(buffer);
}
