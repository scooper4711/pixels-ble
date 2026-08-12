# @scooper4711/pixels-ble

[![CI](https://github.com/scooper4711/pixels-ble/actions/workflows/ci.yml/badge.svg)](https://github.com/scooper4711/pixels-ble/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@scooper4711/pixels-ble)](https://www.npmjs.com/package/@scooper4711/pixels-ble)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A TypeScript library for communicating with [Pixels](https://gamewithpixels.com/) electronic dice over Bluetooth Low Energy (Web Bluetooth API).

## Features

- Connect and manage multiple Pixels dice simultaneously
- Real-time roll detection with face value conversion (D4–D100)
- Battery level monitoring
- Automatic reconnection with adaptive strategy (watch or poll with exponential backoff)
- Typed event system for roll, status, and battery updates
- Bring-your-own storage adapter for persistence
- Dual build: ESM for bundlers, IIFE for script tags

## Installation

```bash
npm install @scooper4711/pixels-ble
```

## Quick Start

```typescript
import { DiceManager, StorageAdapter, KnownDie } from '@scooper4711/pixels-ble';

// Provide a storage adapter (localStorage example)
const storage: StorageAdapter = {
  async load(): Promise<KnownDie[]> {
    return JSON.parse(localStorage.getItem('pixels-dice') ?? '[]');
  },
  async save(dice: KnownDie[]): Promise<void> {
    localStorage.setItem('pixels-dice', JSON.stringify(dice));
  },
};

const manager = new DiceManager(storage);

// Pair a new die (requires user gesture)
const pixel = await manager.requestPixel();

// Listen for rolls
pixel.addEventListener('roll', ({ face, dieType }) => {
  console.log(`Rolled a ${face} on a D${dieType}`);
});

// Listen for battery updates
pixel.addEventListener('battery', ({ level }) => {
  console.log(`Battery: ${level}%`);
});

// Blink the die green
await pixel.blink({ r: 0, g: 255, b: 0 });
```

## API Reference

### `DiceManager`

High-level manager for pairing, reconnecting, and tracking multiple dice.

| Method | Description |
|--------|-------------|
| `requestPixel()` | Pair a new die via the browser Bluetooth picker |
| `connectKnownDevices()` | Reconnect previously paired dice using `watchAdvertisements` |
| `reconnect(systemId)` | Manually trigger reconnection for a specific die |
| `forget(systemId)` | Unpair and remove a die from storage |
| `getPixel(systemId)` | Retrieve a `Pixel` instance by ID |

| Property | Description |
|----------|-------------|
| `dice` | `ReadonlyMap<string, Pixel>` of all known dice |
| `connectedDice` | Array of currently connected `Pixel` instances |

**Events** (`DiceManagerEvents`):

| Event | Payload |
|-------|---------|
| `dieAdded` | `PixelInfo` |
| `dieRemoved` | `PixelInfo` |
| `dieConnected` | `PixelInfo` |
| `dieDisconnected` | `PixelInfo` |
| `dieBatteryUpdate` | `{ pixel: PixelInfo, level: number }` |

### `Pixel`

Represents a single connected Pixels die.

| Method | Description |
|--------|-------------|
| `connect(timeoutMs?)` | Establish GATT connection and subscribe to notifications |
| `disconnect()` | Cleanly disconnect and stop monitoring |
| `blink({ r, g, b })` | Flash the die LEDs with the specified color |
| `startConnectionMonitoring()` | Begin periodic connection health checks |
| `stopConnectionMonitoring()` | Stop health checks |

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Die name from pairing |
| `systemId` | `string` | Unique Bluetooth device ID |
| `dieType` | `number \| null` | Face count (4, 6, 8, 10, 12, 20, 100) |
| `batteryLevel` | `number \| null` | Last known battery percentage |
| `isConnected` | `boolean` | Current connection state |
| `device` | `BluetoothDevice` | Underlying Web Bluetooth device |

**Events** (`PixelEvents`):

| Event | Payload |
|-------|---------|
| `roll` | `{ face: number, dieType: number }` |
| `status` | `{ connected: boolean }` |
| `battery` | `{ level: number }` |

### `EventEmitter<Events>`

Typed event emitter base class used by both `Pixel` and `DiceManager`.

| Method | Description |
|--------|-------------|
| `addEventListener(event, listener)` | Subscribe to an event |
| `removeEventListener(event, listener)` | Unsubscribe from an event |

### Utility Exports

| Export | Description |
|--------|-------------|
| `convertFaceValue(faceIndex, dieType)` | Convert raw face index to display value |
| `attemptReconnection(device, pixel)` | Low-level reconnection (auto-selects strategy) |
| `resetStrategy()` | Reset the detected reconnection strategy |
| `getStrategy()` | Get the current strategy (`'watch'`, `'poll'`, or `'unknown'`) |
| `startMonitoring(pixel)` | Start disconnect monitoring for a Pixel |
| `stopMonitoring(pixel)` | Stop disconnect monitoring for a Pixel |

### Interfaces

```typescript
interface StorageAdapter {
  load(): Promise<KnownDie[]>;
  save(dice: KnownDie[]): Promise<void>;
}

interface KnownDie {
  name: string;
  systemId: string;
  dieType: number | null;
  lastConnected: number;
}
```

## Protocol Coverage

This library implements a subset of the [Pixels dice BLE protocol](https://github.com/GameWithPixels/PixelsUnityPlugin/blob/main/Assets/Plugins/Systemic/Pixels/Messages/MessageType.cs). The full protocol defines 60+ message types spanning animation programming, telemetry streaming, hardware testing, calibration, and more.

**Implemented messages:**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `WhoAreYou` (1) | → Die | Request die identity and capabilities |
| `IAmADie` (2) | ← Die | Die type, firmware info, battery level |
| `RollState` (3) | ← Die | Roll events (rolling, settled, face index) |
| `Blink` (29) | → Die | Flash LEDs with a specified color |
| `RequestBatteryLevel` (33) | → Die | Request current battery percentage |
| `BatteryLevel` (34) | ← Die | Battery level response |

**Not yet implemented:**

| Category | Messages | Reason |
|----------|----------|--------|
| Animation transfer | `TransferAnimationSet`, `BulkSetup`, `BulkData`, `PlayAnimation`, `StopAnimation`, `StopAllAnimations` | Complex multi-packet transfer protocol; not needed for roll detection use cases |
| Telemetry | `Telemetry`, `RequestTelemetry` | Accelerometer streaming is heavy bandwidth; useful for physics apps but out of scope for this library's primary purpose |
| Settings management | `TransferSettings`, `ProgramDefaultParameters`, `SetCurrentBehavior`, `SetDesignAndColor` | Modifies on-die profiles; risky to expose without the full animation framework |
| Calibration | `Calibrate`, `CalibrateFace` | Factory/advanced use only |
| RSSI | `RequestRssi`, `Rssi` | Signal strength has limited utility for consumers |
| Temperature | `RequestTemperature`, `Temperature` | Niche diagnostic use |
| Hardware testing | `TestHardware`, `ClearSettings` | Development/factory tooling |
| Power | `PowerOperation`, `Discharge`, `SetBatteryControllerMode` | Safety concern — exposing power control without guardrails |
| Naming | `SetName`, `SetNameAck` | Low priority; die names rarely change after initial setup |

The protocol layer (`src/ble/protocol.ts`) is designed for incremental extension. Adding support for a new message type requires only a constant, a parser function, and a case in the message dispatcher. See [docs/DESIGN.md](./docs/DESIGN.md#supporting-new-message-types) for the step-by-step guide.

## Browser Support

This library requires the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). Supported environments:

| Browser | Support |
|---------|---------|
| Chrome (desktop) | Full support |
| Chrome (Android) | Full support |
| Edge | Full support |
| Opera | Full support |
| Firefox | Not supported |
| Safari | Not supported |

The `watchAdvertisements` API (used for automatic reconnection) has more limited support. The library falls back to poll-based reconnection when unavailable.

## Build Outputs

| Path | Format | Use Case |
|------|--------|----------|
| `dist/esm/index.js` | ESM | Bundlers (webpack, Vite, Rollup) |
| `dist/umd/index.global.js` | IIFE | Script tags (exposes `window.PixelsBLE`) |
| `dist/types/index.d.ts` | TypeScript declarations | Type checking and editor support |

## Script Tag Usage

```html
<script src="https://unpkg.com/@scooper4711/pixels-ble/dist/umd/index.global.js"></script>
<script>
  const { DiceManager, Pixel } = PixelsBLE;
</script>
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to your branch and open a Pull Request

All PRs must pass CI (lint, test, build) before merge.

## License

[MIT](./LICENSE) — Copyright (c) 2025 scooper4711
