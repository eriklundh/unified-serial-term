# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Remote deploy trigger** — `script/fetch-build-deploy.sh` runs on the
  deploy host and is invoked over SSH after a local test-and-fix cycle. It
  fast-forwards to `origin/main`, builds, and publishes the static `dist/`
  to the site web root (`rsync --delete` + `chown`), then verifies HTTPS
  `200`. Idempotent, self-updating (re-execs on script change), parameterised
  per publish target, with a `DRY_RUN=1` mode. See `docs/DEPLOYMENT.md`.
- **Self-healing driver build** — `npm run build`/`npm run dev` run a
  `prebuild`/`predev` hook (`script/ensure-driver-built.mjs`) that builds the
  sibling `ftdi-webusb-driver` on demand when its `dist/` is missing or stale,
  so a fresh checkout or a pulled driver change builds without a manual step.

### Fixed

- `package-lock.json` is back in sync with `ftdi-webusb-driver@0.1.0`, so
  `npm ci` succeeds on the deploy host.

### Changed

- Stopped tracking `node_modules/` in git (it had been committed despite
  `.gitignore`); enforced LF endings for `*.sh` via `.gitattributes`.

---

## [0.1.0] — 2026-06-02

First release.

### Added

- **Two interchangeable serial backends** selectable at runtime:
  - **Web Serial** (`navigator.serial`) — for CDC devices and FTDI chips
    bound to the FTDI VCP driver
  - **WebUSB (FTDI)** (`navigator.usb` + `ftdi-webusb-driver`) — for FTDI
    FT-X chips bound to WinUSB/libusb, enabling JTAG and UART in the same
    browser session without driver swapping
- **xterm.js terminal pane** with:
  - `FitAddon` — terminal auto-resizes to fill the browser window
  - `WebLinksAddon` — URLs in terminal output become clickable links
  - Local echo mode — keystrokes reflected immediately without a device round-trip
- **Settings panel:**
  - Baud rate: 300 / 1200 / 2400 / 4800 / 9600 / 19200 / 38400 / 57600 /
    115200 / 230400 / 460800 / 921600
  - Data bits: 7 or 8
  - Parity: None / Even / Odd
  - Stop bits: 1 or 2
  - Flow control: None / RTS-CTS
  - Local echo toggle
  - Reset-to-defaults button
- **Persistence via `localStorage`:**
  - All settings round-trip through page reload
  - Backend preference (Web Serial vs WebUSB) persisted
  - Auto-reconnect to last-authorised device on page load
- **Full Playwright E2E test suite** with mocked backends:
  - 41 tests covering connect/disconnect, all settings controls, xterm
    rendering, ANSI sequences, URL links, keyboard shortcuts, copy/paste,
    local echo, backend selector availability and persistence, auto-reconnect
  - `@hardware`-tagged extended mock tests (large data volume, disconnect
    mid-stream, immediate reconnect)
- **105 Vitest unit and component tests**
- **Manual smoke test protocol** (`docs/MANUAL-SMOKE.md`) for real hardware
  verification (Pico CDC loopback and FTDI FT231XS loopback plug)
- **Static deployment** (`npm run build` → `dist/`) with relative asset
  paths; works at any URL subpath with no rebuild
- Documentation:
  - `docs/DEPLOYMENT.md` — build, HTTPS, nginx/Apache config, rsync deploy
  - `docs/LAB-SETUP.md` — classroom setup: WinUSB, udev, permissions
  - `docs/LAB-SERVER-SETUP.md` — server provisioning (nginx, certbot)
  - `docs/MANUAL-SMOKE.md` — manual hardware smoke test protocol
  - `docs/PLAYWRIGHT.md` — E2E test patterns and Pi5 constraints

### Architecture

- `SerialBackend` / `SerialBackendFactory` interface (`src/backends/SerialBackend.ts`)
  decouples the app from both backends; Terminal.vue is backend-agnostic.
- `WebSerialBackend` owns a pump task so `close()` can cancel the pump and
  release `port.readable`'s lock before calling `port.close()`, avoiding the
  "port is busy" footgun.
- `WebUsbFtdiBackend` wraps `FtdiUart` from the `ftdi-webusb-driver` library
  and translates `SerialOptions` to FTDI-specific parameters.
- Settings and backend preference stored in `localStorage` via pure composable
  (`useSettings`) and helper module (`backendPreference`).
- E2E test injection: `window.__webusbFactory` escape hatch in `main.ts` lets
  tests replace the WebUSB factory without touching the app architecture.
