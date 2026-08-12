import { describe, expect, it } from 'vitest';
import {
  convertFaceValue,
  parseBatteryLevel,
  parseIAmADie,
  parseMessage,
  parseRollState,
  parseRssi,
  serializeBlink,
  serializeRequestBatteryLevel,
  serializeRequestRssi,
  serializeWhoAreYou,
} from './protocol.js';

function makeDataView(bytes: number[]): DataView {
  const buffer = new Uint8Array(bytes).buffer;
  return new DataView(buffer);
}

describe('parseIAmADie', () => {
  it('parses die type correctly (enum 7 → 20 faces for D20)', () => {
    const bytes = new Array(21).fill(0);
    bytes[3] = 7;
    const result = parseIAmADie(makeDataView(bytes));
    expect(result.dieType).toBe(20);
  });

  it('parses battery level from byte 20 when available', () => {
    const bytes = new Array(21).fill(0);
    bytes[20] = 85;
    const result = parseIAmADie(makeDataView(bytes));
    expect(result.batteryLevel).toBe(85);
  });

  it('returns null for battery when message is too short (< 21 bytes)', () => {
    const bytes = new Array(10).fill(0);
    bytes[3] = 2;
    const result = parseIAmADie(makeDataView(bytes));
    expect(result.batteryLevel).toBeNull();
  });

  it('returns dieType 0 for unknown enum values', () => {
    const bytes = new Array(21).fill(0);
    bytes[3] = 99;
    const result = parseIAmADie(makeDataView(bytes));
    expect(result.dieType).toBe(0);
  });
});

describe('parseRollState', () => {
  it('extracts event and faceIndex correctly', () => {
    const data = makeDataView([3, 1, 14]);
    const result = parseRollState(data);
    expect(result.event).toBe(1);
    expect(result.faceIndex).toBe(14);
  });

  it('returns ROLL_EVENT_SETTLED (1) for settled events', () => {
    const data = makeDataView([3, 1, 5]);
    const result = parseRollState(data);
    expect(result.event).toBe(1);
  });
});

describe('parseBatteryLevel', () => {
  it('extracts level from byte 1', () => {
    const data = makeDataView([34, 72]);
    const result = parseBatteryLevel(data);
    expect(result.level).toBe(72);
  });
});

describe('parseMessage', () => {
  it('routes message type 2 to iAmADie', () => {
    const bytes = new Array(21).fill(0);
    bytes[0] = 2;
    bytes[3] = 7;
    bytes[20] = 90;
    const result = parseMessage(makeDataView(bytes));
    expect(result.type).toBe('iAmADie');
    if (result.type === 'iAmADie') {
      expect(result.dieType).toBe(20);
      expect(result.batteryLevel).toBe(90);
    }
  });

  it('routes message type 3 to rollState', () => {
    const data = makeDataView([3, 1, 19]);
    const result = parseMessage(data);
    expect(result.type).toBe('rollState');
    if (result.type === 'rollState') {
      expect(result.event).toBe(1);
      expect(result.faceIndex).toBe(19);
    }
  });

  it('routes message type 34 to batteryLevel', () => {
    const data = makeDataView([34, 55]);
    const result = parseMessage(data);
    expect(result.type).toBe('batteryLevel');
    if (result.type === 'batteryLevel') {
      expect(result.level).toBe(55);
    }
  });

  it("returns 'unknown' for unrecognized types", () => {
    const data = makeDataView([255, 0, 0]);
    const result = parseMessage(data);
    expect(result.type).toBe('unknown');
    if (result.type === 'unknown') {
      expect(result.messageType).toBe(255);
    }
  });
});

describe('convertFaceValue', () => {
  describe('d100', () => {
    it('face 0 → 100', () => {
      expect(convertFaceValue(0, 100)).toBe(100);
    });

    it('face 5 → 50', () => {
      expect(convertFaceValue(5, 100)).toBe(50);
    });

    it('face 9 → 90', () => {
      expect(convertFaceValue(9, 100)).toBe(90);
    });
  });

  describe('d10', () => {
    it('face 0 → 10', () => {
      expect(convertFaceValue(0, 10)).toBe(10);
    });

    it('face 1 → 1', () => {
      expect(convertFaceValue(1, 10)).toBe(1);
    });

    it('face 9 → 9', () => {
      expect(convertFaceValue(9, 10)).toBe(9);
    });
  });

  describe('d20', () => {
    it('face 0 → 1', () => {
      expect(convertFaceValue(0, 20)).toBe(1);
    });

    it('face 19 → 20', () => {
      expect(convertFaceValue(19, 20)).toBe(20);
    });
  });

  describe('d6', () => {
    it('face 0 → 1', () => {
      expect(convertFaceValue(0, 6)).toBe(1);
    });

    it('face 5 → 6', () => {
      expect(convertFaceValue(5, 6)).toBe(6);
    });
  });
});

describe('serializeWhoAreYou', () => {
  it('returns single byte [1]', () => {
    const result = serializeWhoAreYou();
    expect(result).toEqual(new Uint8Array([1]));
  });
});

describe('serializeRequestBatteryLevel', () => {
  it('returns single byte [33]', () => {
    const result = serializeRequestBatteryLevel();
    expect(result).toEqual(new Uint8Array([33]));
  });
});

describe('serializeBlink', () => {
  it('returns 14 bytes with correct structure', () => {
    const result = serializeBlink(0xff0000ff, 3, 500);
    expect(result.length).toBe(14);
  });

  it('byte 0 is MESSAGE_TYPE_BLINK (29)', () => {
    const result = serializeBlink(0xff0000ff, 3, 500);
    expect(result[0]).toBe(29);
  });

  it('color is little-endian at bytes 4-7', () => {
    const color = 0xaabbccdd;
    const result = serializeBlink(color, 1, 100);
    const view = new DataView(result.buffer);
    expect(view.getUint32(4, true)).toBe(color);
  });

  it('duration is little-endian at bytes 2-3', () => {
    const duration = 1234;
    const result = serializeBlink(0x000000ff, 1, duration);
    const view = new DataView(result.buffer);
    expect(view.getUint16(2, true)).toBe(duration);
  });
});

describe('parseRssi', () => {
  it('extracts positive RSSI from byte 1', () => {
    const data = makeDataView([36, 0]);
    const result = parseRssi(data);
    expect(result.rssi).toBe(0);
  });

  it('extracts negative RSSI as signed int8', () => {
    // -60 as uint8 = 196
    const data = makeDataView([36, 196]);
    const result = parseRssi(data);
    expect(result.rssi).toBe(-60);
  });

  it('handles -85 dBm correctly', () => {
    // -85 as uint8 = 171
    const data = makeDataView([36, 171]);
    const result = parseRssi(data);
    expect(result.rssi).toBe(-85);
  });
});

describe('parseMessage — RSSI', () => {
  it('routes message type 36 to rssi', () => {
    // -72 as uint8 = 184
    const data = makeDataView([36, 184]);
    const result = parseMessage(data);
    expect(result.type).toBe('rssi');
    if (result.type === 'rssi') {
      expect(result.rssi).toBe(-72);
    }
  });
});

describe('serializeRequestRssi', () => {
  it('returns 4 bytes', () => {
    const result = serializeRequestRssi(true, 5000);
    expect(result.length).toBe(4);
  });

  it('byte 0 is MESSAGE_TYPE_REQUEST_RSSI (35)', () => {
    const result = serializeRequestRssi(true, 5000);
    expect(result[0]).toBe(35);
  });

  it('byte 1 is 2 (repeat) when enabled', () => {
    const result = serializeRequestRssi(true, 5000);
    expect(result[1]).toBe(2);
  });

  it('byte 1 is 0 (off) when disabled', () => {
    const result = serializeRequestRssi(false, 0);
    expect(result[1]).toBe(0);
  });

  it('interval is little-endian at bytes 2-3', () => {
    const result = serializeRequestRssi(true, 5000);
    const view = new DataView(result.buffer);
    expect(view.getUint16(2, true)).toBe(5000);
  });

  it('handles max uint16 interval', () => {
    const result = serializeRequestRssi(true, 65535);
    const view = new DataView(result.buffer);
    expect(view.getUint16(2, true)).toBe(65535);
  });
});
