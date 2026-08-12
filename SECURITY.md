# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this package, please report it privately via GitHub's security advisory feature:

https://github.com/scooper4711/pixels-ble/security/advisories/new

Do not open a public issue for security vulnerabilities.

## Response Timeline

- **Acknowledgement**: Within 48 hours of report submission.
- **Assessment**: Initial severity assessment within 5 business days.
- **Fix**: Critical vulnerabilities patched and released as soon as possible; non-critical within 30 days.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | Yes               |

## Scope

This library communicates with Bluetooth devices using the Web Bluetooth API. Security-relevant areas include:

- BLE protocol message parsing (buffer handling, bounds checking)
- Data passed to the StorageAdapter interface
- Any future network-facing functionality

Issues in the Web Bluetooth API itself or browser implementations should be reported to the respective browser vendors.
