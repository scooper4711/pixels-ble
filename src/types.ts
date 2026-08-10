/** Event map for a single Pixel die */
export interface PixelEvents {
  roll: { face: number; dieType: number };
  status: { connected: boolean };
  battery: { level: number };
}

/** Known die type values (face count) */
export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** Persisted information about a known die */
export interface KnownDie {
  name: string;
  systemId: string;
  dieType: number | null;
  lastConnected: number;
}

/** Storage adapter interface — consumers provide their own persistence backend */
export interface StorageAdapter {
  load(): Promise<KnownDie[]>;
  save(dice: KnownDie[]): Promise<void>;
}

/** Minimal Pixel interface for type references (full class in Pixel.ts) */
export interface PixelInfo {
  readonly name: string;
  readonly systemId: string;
  readonly dieType: number | null;
  readonly batteryLevel: number | null;
  readonly isConnected: boolean;
}

/** Event map for the DiceManager */
export interface DiceManagerEvents {
  dieAdded: PixelInfo;
  dieRemoved: PixelInfo;
  dieConnected: PixelInfo;
  dieDisconnected: PixelInfo;
  dieBatteryUpdate: { pixel: PixelInfo; level: number };
}
