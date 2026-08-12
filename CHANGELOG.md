# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-12

### Added

- `Pixel` class for managing a single Pixels die over BLE (connect, disconnect, blink, roll events, battery polling)
- `DiceManager` class for multi-die orchestration (pairing, reconnection, persistence, event forwarding)
- Typed `EventEmitter` base class with `addEventListener` / `removeEventListener`
- BLE protocol layer with support for modern and legacy Pixels service UUIDs
- Message parsing for IAmADie, RollState, and BatteryLevel notifications
- Face value conversion for D4, D6, D8, D10, D12, D20, and D100
- Adaptive reconnection strategy (watch-based with poll fallback and exponential backoff)
- Connection health monitoring with automatic reconnection on disconnect
- `StorageAdapter` interface for consumer-provided persistence
- Dual build output: ESM for bundlers, IIFE (`PixelsBLE` global) for script tags
- TypeScript declarations for full editor support
- CI workflow (lint, test, build) on Node 20 and 22
- Automated NPM publish workflow on GitHub Release with provenance attestation

[0.1.0]: https://github.com/scooper4711/pixels-ble/releases/tag/v0.1.0
