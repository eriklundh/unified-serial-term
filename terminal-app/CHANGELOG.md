# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.1.3] — 2026-06-06

### Changed

- **Renamed the app to "Unified Serial Console"** (npm package
  `web-serial-console` → `unified-serial-console`; browser title and README
  heading updated to match). The new name reflects the project's
  `unified-serial-*` family and is more accurate — the app unifies both the
  **Web Serial** and **WebUSB (FTDI)** backends, not just Web Serial. Upstream
  reference links to `zaxbux/web-serial-console` are unchanged (that's a
  different, external project). Also brought `package-lock.json`'s root
  name/version back in sync.

---

## [1.1.2] — 2026-06-06

Serial stream-lifecycle hardening. Found on a Raspberry Pi 5 host with an
FTDI loopback plug: after disconnecting in the browser you couldn't
reconnect, a page refresh showed a live connection that wasn't usable, and
the kernel kept renumbering the `ttyUSB*` node — all symptoms of a leaked OS
serial handle.

### Fixed

- **Web Serial disconnect no longer leaks the port / blocks reconnect.** The
  backend exposed `port.writable` raw, so `Terminal.vue`'s session-long writer
  locked the native port stream and only released it *after* disconnect.
  `port.close()` then ran with the lock held and rejected ("Cannot cancel a
  locked stream"); the error was swallowed, the OS handle stayed open, and the
  next `open()` on the same `SerialPort` failed. The backend now owns a single
  internal writer on `port.writable` (mirroring the existing readable pump) and
  releases it before `port.close()`, so the consumer locks an intermediate
  stream that never blocks teardown.
- **Disconnect failures are surfaced, not hidden.** A rejected `backend.close()`
  is now reported as a "Disconnect warning: …" status instead of being caught
  and discarded, while state cleanup still happens unconditionally. A clean
  disconnect clears the status line.
- **Auto-reconnect verifies the port and never leaves a half-open handle.** On
  page load the app trusted `open()` resolving and showed a live connection
  without confirming the port was usable, and a rejected `open()` left its
  partially-acquired handle claimed. It now best-effort `close()`s the device on
  an `open()` failure, and only claims connected when the backend reports
  `isOpen` — tearing down anything that opened but isn't actually ready.

---

## [1.1.1] — 2026-06-05

### Fixed

- **Settings drawer header no longer hides behind the toolbar.** The drawer
  opened at `top: 0` while the toolbar sat above it (`z-index`), so the
  drawer's own title and ✕ close button were occluded and the ✕ was
  unclickable (Esc / the ⚙ toggle still closed it). The drawer now sits
  *below* the toolbar via `inset: var(--toolbar-h) …`, where `--toolbar-h`
  tracks the (wrap-variable) toolbar height through a `ResizeObserver`. The
  ✕ is visible and clickable again, and ⚙ stays clickable — no more
  z-index tug-of-war. Caught by the post-release production UI smoke.

---

## [1.1.0] — 2026-06-05

Terminal UX & theming release.

### Added

- **Colour themes** — four built-in themes (Dark, Light, Solarized Dark,
  Nord), selectable in Settings → Appearance. The chrome (toolbar, drawer)
  and the xterm terminal stay visually consistent because both are driven
  from one set of design tokens.
- **Font selection** — choose the terminal typeface in Settings: the
  zero-download system-monospace stack (default) plus five self-hosted
  faces — Source Code Pro, JetBrains Mono, Fira Code, Cascadia Code, and
  IBM Plex Mono. Each woff2 (Latin-400, SIL OFL 1.1) is bundled and
  **lazy-loaded** — downloaded only when its family is selected — with
  `font-display: swap`. Font size is configurable (8–32 px).
- **Clear terminal** — an easy-to-find toolbar **Clear** button plus a
  **configurable hotkey** (default `Ctrl+Shift+K`) that can be rebound or
  turned off. The hotkey is intercepted app-level (capture phase) so it
  never leaks to the device.
- **Non-modal settings drawer** — settings open in a native `<dialog>`
  drawer that slides in from the right; the terminal keeps streaming and
  rendering behind it. `Esc` or the ✕ closes it; `inert` when hidden.
- **Durable, portable settings** — appearance and connection settings
  persist in `localStorage`, `navigator.storage.persist()` can be requested
  ("Keep on this device"), and settings round-trip through JSON
  **Export/Import**.
- Token-driven control styling (contemporary buttons, selects, focus rings)
  with `:focus-visible` outlines and a `prefers-reduced-motion` fallback for
  the drawer transition.

### Changed

- **Dark is the standard default theme**, independent of the OS
  `prefers-color-scheme`.

### Fixed

- **Clear** now fully resets the terminal and homes the cursor to the
  top-left (it maps to xterm `reset()`); previously it kept the prompt line
  and left the cursor in place.
- Keyboard focus returns to the terminal after clicking **Clear**, after the
  settings drawer closes, and after connect/disconnect — so typing resumes
  immediately instead of staying trapped on the clicked control.

---

## [1.0.0] — 2026-06-05

First production release: the v0.1.0 app plus the tag-gated deploy pipeline.

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
- Upgraded Vitest and `@vitest/coverage-v8` to v4 (from v3), aligning with
  the sibling `ftdi-webusb-driver`. Component-test mocks were updated to the
  v4 requirement that constructor mocks use `function`/`class` (not arrows).

### Security

- Resolved [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
  (critical) by upgrading Vitest to ≥ 4.1.8. The flaw is in the Vitest UI
  dev server (a devDependency, never shipped or used by this project's
  scripts), so production and CI were unaffected; upgraded to keep `npm
  audit` clean.

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
