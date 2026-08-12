# Coding Standards

This document defines the coding conventions and quality expectations for `@scooper4711/pixels-ble`.

## Language and Tooling

- **Language**: TypeScript (strict mode)
- **Build**: tsup (ESM + IIFE dual output)
- **Test**: Vitest with v8 coverage
- **Formatting**: Default TypeScript conventions (2-space indent, single quotes, trailing commas)
- **Type checking**: `tsc --noEmit` (run via `npm run lint`)

## Naming Conventions

- **Files**: PascalCase for classes (`Pixel.ts`, `DiceManager.ts`), camelCase for modules (`protocol.ts`, `constants.ts`)
- **Classes**: PascalCase nouns (`Pixel`, `DiceManager`, `EventEmitter`)
- **Functions**: camelCase verbs (`parseMessage`, `convertFaceValue`, `serializeBlink`)
- **Constants**: UPPER_SNAKE_CASE (`PIXELS_SERVICE_UUID`, `ROLL_EVENT_SETTLED`)
- **Interfaces**: PascalCase nouns, no `I` prefix (`StorageAdapter`, `KnownDie`, `PixelEvents`)
- **Type aliases**: PascalCase (`DieType`, `ReconnectionStrategy`, `ParsedMessage`)
- **Private fields**: Prefixed with underscore only when shadowing a public accessor (`_device` → `get device()`)

## Code Organization

### File Structure

```
src/
├── index.ts              # Public barrel export (no logic)
├── Pixel.ts              # Single die controller
├── DiceManager.ts        # Multi-die orchestrator
├── EventEmitter.ts       # Generic typed event emitter
├── types.ts              # Shared interfaces and type aliases
├── ble/
│   ├── constants.ts      # Protocol constants (UUIDs, message types)
│   └── protocol.ts       # Message parsing and serialization
└── reconnection/
    ├── strategy.ts       # Adaptive reconnection logic
    └── monitor.ts        # Disconnect detection
```

### Module Rules

- `index.ts` re-exports only. No implementation logic.
- Each file has a single responsibility. A file that grows beyond 300 lines likely needs splitting.
- Internal helpers stay in the file that uses them unless shared by multiple modules.
- Circular imports are not permitted.

## Functions

- Prefer small, focused functions (under 30 lines).
- Pure functions where possible — `protocol.ts` is entirely stateless.
- Side effects (BLE I/O, timers, event subscriptions) are isolated in `Pixel.ts`, `DiceManager.ts`, and `monitor.ts`.
- Use early returns to reduce nesting.

## Error Handling

- Throw `Error` with a descriptive message for programmer errors (e.g., calling `blink()` when disconnected).
- Silently catch and ignore expected failures in background reconnection (the user sees a status event instead).
- Never return `null` where an empty array or thrown error is more appropriate.
- Comment all intentionally empty `catch` blocks explaining why the error is swallowed.

## Type Safety

- Strict mode is mandatory — no `any` in production code.
- Use discriminated unions for message parsing (`ParsedMessage`).
- Prefer `readonly` for properties that should not change after construction.
- Use generic constraints to keep the event emitter type-safe (`EventEmitter<Events extends object>`).

## Comments

- Explain *why*, not *what*. The code should be self-documenting for the *what*.
- Use JSDoc (`/** */`) on public interfaces and exported types. These appear in editor tooltips and generated docs.
- Inline comments for non-obvious protocol details (byte offsets, firmware-specific behavior).
- No commented-out code — use version control.

## Testing

- Tests live alongside source in `*.test.ts` files (co-located) or in a top-level `tests/` directory.
- One test file per module under test.
- Use descriptive test names that read as a specification: `"emits roll event only after movement followed by settled state"`.
- Mock BLE APIs at the boundary (`BluetoothDevice`, `BluetoothRemoteGATTServer`). Do not mock internal module functions.
- Coverage target: 80%+ line coverage on `src/ble/` (the deterministic protocol logic).

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <subject in imperative mood>
```

| Type | Use |
|------|-----|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, CI, dependency updates |

- Subject line: imperative mood, no period, max 72 characters.
- Body (optional): explain what and why, not how. Wrap at 72 characters.
- All commits must be signed (`git commit -S`).

## Pull Requests

- One logical change per PR.
- PR title follows the same conventional commit format.
- CI must pass (lint, test, build) before merge.
- Squash-merge to main for a clean linear history.

## Dependencies

- **Zero production dependencies** — this is a hard rule. The library must not introduce transitive dependency risk for consumers.
- Dev dependencies are pinned to exact major versions with caret ranges (`^`).
- Dependency updates are managed by Dependabot (weekly, grouped by type).
