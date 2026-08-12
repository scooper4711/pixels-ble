# Design Decisions

This document explains the key design choices behind `@scooper4711/pixels-ble`, their rationale, and guidance for extending the library.

## Guiding Principles

1. **Zero dependencies** — The library ships nothing beyond its own code. Consumers should not inherit transitive dependency risk from a BLE utility.
2. **Consumer-owned persistence** — Storage is injected, never assumed. The library works equally in a Chrome extension (using `chrome.storage`), a web app (using IndexedDB), or a test harness (using an in-memory stub).
3. **Graceful degradation** — BLE APIs vary across browsers and OS versions. The library probes capabilities at runtime and adapts, rather than failing on missing features.
4. **Typed events over callbacks** — A single, consistent event pattern makes the API predictable and composable with framework reactivity systems.

## API Design

### Event Emitter as Base Class

Both `Pixel` and `DiceManager` extend `EventEmitter<Events>`. This was chosen over alternative patterns:

| Alternative | Why Not |
|-------------|---------|
| Node-style `.on()/.off()` | Naming conflicts with DOM APIs; consumers expect DOM-like naming in browser context |
| RxJS Observables | Adds a heavy dependency; overkill for a handful of event types |
| Callback registration methods | Scales poorly with multiple event types; no unsubscribe ergonomics |

The generic parameter (`PixelEvents`, `DiceManagerEvents`) ensures listeners receive correctly typed payloads at compile time without runtime overhead.

### StorageAdapter Interface

```typescript
interface StorageAdapter {
  load(): Promise<KnownDie[]>;
  save(dice: KnownDie[]): Promise<void>;
}
```

Design choices:

- **Async by default** — Even synchronous backends (localStorage) can conform. Async-first ensures compatibility with IndexedDB, chrome.storage, and network-backed stores.
- **Full-replacement save** — `save()` receives the complete list rather than individual mutations. This simplifies conflict resolution and keeps the interface minimal. For small datasets (typically fewer than 20 dice), the overhead is negligible.
- **No schema versioning in the adapter** — The library owns the `KnownDie` shape. If it evolves, migration logic belongs in the library, not the adapter.

### Pixel as a Stateful Object

Each `Pixel` instance encapsulates one Bluetooth device's full lifecycle. Alternatives considered:

- **Stateless functions over a device handle** — Rejected because BLE connections carry state (GATT server, characteristics, notification subscriptions) that must be coordinated.
- **Single global connection manager** — Rejected because it conflates policy (which dice to manage) with mechanism (how to talk to one die). The two-layer split (`DiceManager` for policy, `Pixel` for mechanism) keeps each class focused.

## Reconnection Strategy

### Problem

Bluetooth connections drop regularly due to:
- Device going out of range
- OS power management (sleep/wake cycles)
- Chrome's aggressive GATT cleanup

A library that loses connection without recovery is unusable in practice.

### Approach: Adaptive Strategy Detection

The library supports two reconnection mechanisms:

**Watch strategy** — Uses `BluetoothDevice.watchAdvertisements()` to detect when the die comes back in range, then reconnects immediately. This is the preferred path: it's power-efficient and responsive.

**Poll strategy** — Falls back to repeated `gatt.connect()` calls with exponential backoff (5 s → 10 s → 20 s → 40 s → 60 s). Used when `watchAdvertisements` is unavailable or fails.

On the first disconnect, the library probes for watch support. The result is cached for the session via a module-level variable. This avoids repeated capability detection and keeps reconnection fast on subsequent disconnects.

### Backoff Design

```
Attempt 1:  5 seconds
Attempt 2: 10 seconds
Attempt 3: 20 seconds
Attempt 4: 40 seconds
Attempt 5: 60 seconds (max)
```

After 5 failed attempts, the library throws and stops retrying. This bounds resource usage and avoids infinite loops when a die is genuinely unreachable (e.g., powered off or out of battery).

The attempt counter is tracked per-device via a `WeakMap`, so one die's failure does not block others.

### Stale GATT Handling

After sleep/wake, Chrome may report `gatt.connected === true` for a device that is no longer reachable. The reconnection logic explicitly disconnects stale connections before attempting a fresh connect:

```typescript
if (device.gatt?.connected) {
  device.gatt.disconnect();
  await sleep(1000); // Allow the stack to settle
}
await pixel.connect();
```

## BLE Protocol Layer

### Dual UUID Support

Pixels dice have shipped with two different GATT service UUIDs over their hardware revisions. The library tries the modern UUIDs first, falls back to legacy, and as a final resort discovers characteristics by property flags. This three-pass approach maximizes compatibility:

1. **Exact UUID match (modern)** — Fastest path, no enumeration needed.
2. **Exact UUID match (legacy)** — Same speed, different UUIDs.
3. **Property-based discovery** — Enumerates all characteristics and selects by `notify`/`write` flags. Handles potential future UUID changes.

### Message Parsing as Discriminated Union

```typescript
type ParsedMessage =
  | { type: 'iAmADie'; dieType: number; batteryLevel: number | null }
  | { type: 'rollState'; event: number; faceIndex: number }
  | { type: 'batteryLevel'; level: number }
  | { type: 'unknown'; messageType: number };
```

This pattern enables exhaustive switch handling with TypeScript's narrowing, and makes the protocol surface self-documenting. Unknown messages are captured rather than silently dropped, supporting future protocol extensions.

### Face Value Conversion

Raw BLE notifications report a zero-indexed face number. The conversion to a display value varies by die type:

| Die Type | Conversion |
|----------|-----------|
| D100 | `faceIndex * 10` (0 → 100) |
| D10 | `faceIndex` (0 → 10) |
| All others | `faceIndex + 1` |

This logic is centralized in `convertFaceValue` and exported for consumers who handle raw protocol data directly.

### Roll Settlement Detection

The die firmware sends multiple roll state events during a throw (pickup, rolling, settling). The library only emits a `roll` event when:

1. A non-settled event has been seen (`hasMoved = true`), confirming the die was actually thrown.
2. A `ROLL_EVENT_SETTLED` event arrives after movement.

This filters out spurious settled events from minor table vibrations or reconnection identity messages.

## Extension Points

### Adding New Die Commands

1. Add the message type constant to `src/ble/constants.ts`.
2. Add a serialization function to `src/ble/protocol.ts` following the existing pattern.
3. Expose a method on `Pixel` that calls the serializer and writes to the write characteristic.

### Supporting New Message Types

1. Add the message type constant to `src/ble/constants.ts`.
2. Add a parser function and extend the `ParsedMessage` union in `src/ble/protocol.ts`.
3. Add a case to `parseMessage`'s switch.
4. Handle the new message in `Pixel.processNotification`.
5. If it produces a user-facing event, extend `PixelEvents` in `src/types.ts`.

### Custom Reconnection Behavior

Consumers who need different reconnection behavior can:

- Use `stopMonitoring(pixel)` to disable the built-in monitor.
- Listen for `status` events on `Pixel` to detect disconnects.
- Call `attemptReconnection(device, pixel)` or implement their own logic using `pixel.connect()`.

### Alternative Storage Backends

Implement the `StorageAdapter` interface. Examples:

```typescript
// IndexedDB
const idbStorage: StorageAdapter = {
  async load() { /* read from IDB */ },
  async save(dice) { /* write to IDB */ },
};

// Chrome extension storage
const chromeStorage: StorageAdapter = {
  async load() {
    const { dice } = await chrome.storage.local.get('dice');
    return dice ?? [];
  },
  async save(dice) {
    await chrome.storage.local.set({ dice });
  },
};

// In-memory (for tests)
const memoryStorage: StorageAdapter = {
  data: [] as KnownDie[],
  async load() { return this.data; },
  async save(dice) { this.data = dice; },
};
```

## Security Considerations

- **User gesture requirement** — `requestDevice` requires a user gesture (click, tap). This is enforced by the browser, not the library. Consumers must call `requestPixel()` from an event handler.
- **No secrets** — The library stores only die metadata (name, ID, type, timestamp). No authentication tokens or sensitive data flow through the storage adapter.
- **Scoped permissions** — Web Bluetooth grants access only to explicitly paired devices. The library cannot scan for or connect to arbitrary Bluetooth devices.

## Trade-offs and Known Limitations

| Decision | Trade-off |
|----------|-----------|
| Module-level strategy cache | Fast after first probe, but does not adapt if browser capabilities change mid-session (unlikely in practice) |
| WeakMap for per-device state | Prevents memory leaks, but state is lost if device reference is garbage collected |
| Full-replacement `save()` | Simple adapter contract, but inefficient if the die list grows large (mitigated: typical count is < 20) |
| IIFE build with global name | Enables script-tag usage, but pollutes the global namespace with `PixelsBLE` |
| No retry queue | Reconnection is fire-and-forget per disconnect event; rapid disconnect/reconnect cycles may overlap (mitigated: debounce in monitor) |

## Protocol Scope

### Upstream Specification

The Pixels dice firmware supports [60+ message types](https://github.com/GameWithPixels/PixelsUnityPlugin/blob/main/Assets/Plugins/Systemic/Pixels/Messages/MessageType.cs), covering everything from roll detection to animation programming, accelerometer telemetry, calibration, hardware testing, and power management.

This library deliberately implements only the messages needed for its primary use cases: connecting to dice, detecting rolls, monitoring battery, and providing basic LED feedback.

### Why a Minimal Subset

1. **Stability over surface area** — Each implemented message is fully tested and understood. Shipping half-baked support for animation transfer (which requires a complex multi-packet bulk protocol) would create a brittle API surface.

2. **Safety** — Messages like `PowerOperation`, `Discharge`, and `SetBatteryControllerMode` can affect hardware state in ways that are difficult to reverse. Exposing these without proper guardrails and documentation would be irresponsible.

3. **Scope alignment** — This library targets web applications that read dice rolls and provide visual feedback. The animation programming system (which requires compiling animation bytecode and transferring it via the bulk data protocol) is a fundamentally different tool with different consumers.

4. **Incremental extension** — The protocol layer is architected for easy addition of new messages. Each new message requires only a constant, a parser/serializer, and a case in the dispatcher. This makes it straightforward to add support as use cases arise without carrying the maintenance burden of unused code.

### What We Implement and Why

| Message | Rationale |
|---------|-----------|
| `WhoAreYou` / `IAmADie` | Essential — identifies the die type, face count, and firmware version on connection |
| `RollState` | Core purpose — real-time roll detection |
| `Blink` | Provides immediate visual feedback to confirm connectivity and identify which physical die maps to which logical instance |
| `RequestBatteryLevel` / `BatteryLevel` | Practical necessity — users need to know when a die is running low |

### Candidates for Future Implementation

| Message | Use Case | Complexity |
|---------|----------|-----------|
| `RequestRssi` / `Rssi` | Signal strength display for connection quality UI | Low |
| `RequestTemperature` / `Temperature` | Diagnostic display | Low |
| `SetName` / `SetNameAck` | Allow renaming dice from the app | Low |
| `PlayAnimation` / `StopAnimation` | Play pre-loaded animations | Medium (requires knowing animation indices) |
| `Telemetry` | Real-time accelerometer for physics-aware apps | Medium (high bandwidth, needs throttling) |
| `TransferAnimationSet` + bulk protocol | Custom animation programming | High (multi-packet protocol, animation compiler) |
