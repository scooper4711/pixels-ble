# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-12

### Added
- Add signed tags, artifact attestation, and initial setup docs
- Switch to staged publishing with OIDC trusted publishing
- Create draft GitHub Release with changelog notes in release script

### Fixed
- Improve release sync check with directional error messages
- Abort release if local main is behind origin

### Changed
- Add security policy for vulnerability disclosure
- Add acknowledgements section to README
- Bump actions/download-artifact from 4 to 8
- Bump actions/checkout from 4 to 7
- Bump actions/setup-node from 4 to 7
- Bump actions/upload-artifact from 4 to 7
- Bump SonarSource/sonarqube-scan-action
- Add CI/CD workflows, SonarCloud, and Dependabot configuration

[0.2.0]: https://github.com/scooper4711/pixels-ble/releases/tag/v0.2.0

## [0.1.2] - 2026-08-12

### Fixed
- Use sed -E for macOS-compatible regex in release script
- Suppress unhandled reconnection promise rejections

### Changed
- Add repository field for npm trusted publishing
- Add release script and pre-commit hook (lint + test)
- Add CI/CD workflows, SonarCloud, and Dependabot configuration
- Add README, architecture, design, coding standards, and release guide

[0.1.2]: https://github.com/scooper4711/pixels-ble/releases/tag/v0.1.2

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
