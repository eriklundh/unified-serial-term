# TEST-PLAN.md — terminal-app

Acceptance test plan for the browser terminal application.
Three tiers: unit tests (Vitest, no hardware), E2E non-hardware (Playwright with
mocked browser APIs), and hardware-in-loop (HIL) acceptance tests run against
both loopback devices in Chromium.

---

## Tier overview

| Tier | Command | Hardware | Gate |
|------|---------|----------|------|
| Unit | `npm test` | none | always |
| E2E mocked | `npm run test:e2e` | none | always |
| HIL — Web Serial (Pico CDC) | `npm run test:hw` | Pico CDC test rig | `TERMINAL_HW_TEST=1` |
| HIL — WebUSB FTDI | `npm run test:hw` | FTDI loopback plug | `TERMINAL_HW_TEST=1` |

`npm run test:hw` automatically runs `../hil-preflight/preflight.sh` before
Playwright starts. The HIL tests are tagged `@hardware` in test titles;
without `TERMINAL_HW_TEST=1` those tests are excluded by the Playwright grep filter.

---

## Prerequisites

### Unit tests and mocked E2E

- `npm install`
- `npx playwright install chromium` (first run only)

### HIL — Web Serial backend (Pico CDC test rig)

- Raspberry Pi Pico flashed with the CDC loopback firmware from
  `../pico-cdc-test-rig/`, connected via USB, appearing as `/dev/ttyACM0`
  (or the first ACM port; adjust `--port` if needed).
- `ftdi_sio` kernel driver state: **no action needed** (the Pico CDC device
  uses the `cdc_acm` driver, not `ftdi_sio`).

### HIL — WebUSB FTDI backend (FTDI loopback plug)

- FTDI loopback plug (FT231XS, VID `0x0403`, PID `0x6015`) connected.
- Plug wiring: TX→RX shorted; RTS→CTS shorted; DTR→DSR shorted.
- `ftdi_sio` kernel driver **unbound** before the run:
  ```
  ../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
  ```
- After the run, rebind:
  ```
  ../../ftdi-unbind/macos-linux/ftdi-bind 0403:6015
  ```
- The WebUSB HIL tests (§5) are manual; see `docs/MANUAL-SMOKE.md` (Smoke test B).
  Automated Playwright tests use mocked backends — see implementation note in §4.

---

## Unit test suite — `npm test`

Expected: **all Vitest tests pass.**

### T-U-01  SerialBackend interface  (`src/backends/SerialBackend.test.ts`)

| Test | Expectation |
|------|-------------|
| `MockSerialBackend` starts with `isOpen: false` | — |
| `open()` flips `isOpen` to true | — |
| `close()` flips `isOpen` to false | — |
| Data pushed into test `TransformStream` appears on `readable` | — |
| Writes to `writable` are recorded in the mock | — |

### T-U-02  WebSerialBackend  (`src/backends/WebSerialBackend.test.ts`)

| Test | Expectation |
|------|-------------|
| `WebSerialFactory.isAvailable()` | Returns `'serial' in navigator` |
| `WebSerialFactory.pickDevice()` | Calls `navigator.serial.requestPort()`, wraps result |
| `WebSerialFactory.listPaired()` | Calls `navigator.serial.getPorts()`, wraps each port |
| `WebSerialBackend.open(opts)` | Calls `port.open(opts)` |
| `WebSerialBackend.close()` | Cancels pump, calls `port.close()`, flips `isOpen` |
| Data forwarded from `port.readable` → `backend.readable` | Pump re-emits chunks |
| Close while reader locked | Cancels reader before `port.close()`; no "port busy" error |

### T-U-03  WebUsbFtdiBackend  (`src/backends/WebUsbFtdiBackend.test.ts`)

| Test | Expectation |
|------|-------------|
| `WebUsbFtdiFactory.isAvailable()` | Returns `'usb' in navigator` |
| `WebUsbFtdiFactory.pickDevice()` | Calls `navigator.usb.requestDevice({ filters: [{vendorId:0x0403, productId:0x6015}] })` |
| `WebUsbFtdiFactory.listPaired()` | Calls `navigator.usb.getDevices()`, filters to VID `0x0403` |
| `WebUsbFtdiBackend.open(opts)` | Calls `FtdiUart.open()` then `FtdiUart.configure()` with translated options |
| Option translation: `flowControl:'hardware'` | Translated to `'rtscts'` |
| Option translation: `flowControl:'none'` | Translated to `'none'` |
| `readable` / `writable` | Are `FtdiUart.readable` / `FtdiUart.writable` |
| `close()` | Calls `FtdiUart.close()`, flips `isOpen` |

### T-U-04  BackendSelector component  (`src/components/BackendSelector.test.ts`)

| Test | Expectation |
|------|-------------|
| Both backends available | Dropdown shows both options |
| Only Web Serial available | Dropdown shows Web Serial only |
| No backends available | Shows "This browser doesn't support serial-over-USB" message |
| `disabled=true` | Select element is disabled |
| User changes selection | Emits `update:modelValue` with new `BackendId` |

### T-U-05  Terminal component  (`src/components/Terminal.test.ts`)

| Test | Expectation |
|------|-------------|
| Mounts without error | xterm `Terminal` instance is created |
| `open()` called with DOM element | xterm attached to container div |
| `FitAddon` loaded | `fitAddon.fit()` called on mount |
| `WebLinksAddon` loaded | Addon registered on terminal |
| `onData` wired | Keystrokes reach the emitted `data` event |
| `readable` prop piped to terminal | Data from stream written to xterm |
| `writable` prop receives keypresses | Keystrokes written to the writable stream |
| `onUnmounted` | `terminal.dispose()` called |

### T-U-06  backendPreference  (`src/settings/backendPreference.test.ts`)

| Test | Expectation |
|------|-------------|
| No value stored | Returns first available factory |
| `writePreference('webusb-ftdi')` then read | Returns `webusb-ftdi` factory |
| Stored value not in available factories | Falls back to first available |
| `localStorage` cleared | Falls back to first available |

### T-U-07  useSettings composable  (`src/settings/useSettings.test.ts`)

| Test | Expectation |
|------|-------------|
| Initial load — no storage | Returns all defaults (115200, 8N1, none, no echo) |
| Change `baudRate` | Persisted to `localStorage` automatically |
| All six settings round-trip | `baudRate`, `dataBits`, `parity`, `stopBits`, `flowControl`, `localEcho` |
| `reset()` | Restores all defaults; clears `localStorage` |
| `reset()` does not re-persist defaults | `skipNextSave` flag prevents double-write |

### T-U-08  App integration  (`src/App.test.ts`)

| Test | Expectation |
|------|-------------|
| Renders with no factories | BackendSelector shows no-browser-support message; Connect disabled |
| Renders with one factory | Backend dropdown shows that factory |
| Connect button clicked | Calls `factory.pickDevice()` then `backend.open(settings)` |
| Connection open | Disconnect button shown; all settings controls disabled |
| Disconnect clicked | `backend.close()` called; Connect button shown; controls enabled |
| `listPaired()` returns a device | Auto-reconnect fires on mount; status message "Auto-reconnected to …" |

---

## E2E mocked suite — `npm run test:e2e`

These tests run in a real Chromium instance with `navigator.serial` and
`navigator.usb` mocked at the page level. No physical hardware required.

### T-E-01  Page loads  (`e2e/smoke.spec.ts`)

| Step | Expectation |
|------|-------------|
| Navigate to `http://localhost:5173` | Page title is "Serial Terminal" (or equivalent) |
| App header visible | Backend selector and Connect button rendered |
| Terminal pane visible | xterm container rendered and has non-zero dimensions |

### T-E-02  Backend selector UI

| Step | Expectation |
|------|-------------|
| Mock `navigator.serial` present, `navigator.usb` absent | Dropdown shows "Web Serial" only |
| Mock both present | Dropdown shows both backends |
| Mock neither present | "This browser doesn't support serial-over-USB" message visible |
| Change backend selection | Persists after reload |

### T-E-03  Settings controls interaction

All settings controls tested in the disconnected state:

| Control | Interaction | Expectation |
|---------|-------------|-------------|
| Baud select | Change to 9600 | `localStorage` updated; value survives reload |
| Baud select | All 12 options present | 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600 |
| Data bits select | Change to 7 | Persists; reloads with 7 selected |
| Parity select | Cycle none → even → odd | Each persists |
| Stop bits select | Change to 2 | Persists |
| Flow control select | Change to hardware | Persists |
| Echo checkbox | Toggle on | Persists |
| Reset button | Click | All controls return to defaults (115200, 8, none, 1, none, unchecked) |

### T-E-04  Controls locked while connected  (with mocked backend)

| Step | Expectation |
|------|-------------|
| Mock a connected state (inject backend) | Backend selector, all settings selects, echo checkbox, and Reset button all have `disabled` attribute |
| Disconnect | All controls become enabled |

---

## HIL test suite — `npm run test:hw`

All tests below are tagged `@hardware` in their title so they run only when
`TERMINAL_HW_TEST=1` is set. The preflight hook verifies both hardware rigs
before Playwright starts.

### Implementation note: automated tests use mocked backends; HIL tests are manual

**Real device selection cannot be automated from Playwright's headless Chromium
on the Raspberry Pi 5.** CDP `DeviceAccess` events do not fire in `headless_shell`
because USB enumeration requires the UI subprocess. This was verified empirically
and is documented in `docs/PLAYWRIGHT.md §7`.

Consequence for this test plan:

- **Tests T-H-WS-\* and T-H-USB-\* are manual acceptance tests**, executed by
  a human following the step-by-step protocol in `docs/MANUAL-SMOKE.md`.
- **Automated Playwright E2E tests** (Phase 7 in PLAN.md) use `addInitScript`
  mocks per the injection pattern in `docs/PLAYWRIGHT.md` (Approach B for WebUSB).
  They exercise real xterm.js, real Vue reactivity, and real settings persistence.
- **Real hardware protocol verification** is covered by
  `ftdi-webusb-driver test:hw` (Node.js `usb` library, no browser picker).

---

### §4  HIL — Web Serial backend (Pico CDC test rig)

The Pico CDC rig presents as a CDC ACM device (`/dev/ttyACM0`). It acts
as a pure loopback at any baud rate and reports line-coding changes via USB.

#### T-H-WS-01  Basic connect and echo

| Step | Expectation |
|------|-------------|
| Select "Web Serial" backend | Backend selector shows "Web Serial" |
| Click Connect → select `/dev/ttyACM0` in device picker | Status: connected; Disconnect button visible |
| Type `"HELLO"` in terminal | 5 bytes sent over serial |
| Loopback reflects bytes | `"HELLO"` appears in terminal pane |
| Click Disconnect | Port released cleanly; Connect button visible; no console errors |

#### T-H-WS-02  Baud rate changes

For each baud in `[9600, 19200, 38400, 57600, 115200]`:

| Step | Expectation |
|------|-------------|
| Set baud select to target rate | Setting visible in dropdown |
| Connect to Pico CDC | No error |
| Type `"TEST"` | `"TEST"` echoed back |
| Disconnect | Clean close |

(High rates ≥ 230400 are excluded because the Pico CDC firmware may not
support them at full fidelity; run manually if needed.)

#### T-H-WS-03  Line settings with loopback

| Setting | Value | Step | Expectation |
|---------|-------|------|-------------|
| Data bits | 7 | Type ASCII `"ABC"` (7-bit clean) | Echoed correctly |
| Parity | even | Type and receive | No framing errors visible in terminal |
| Stop bits | 2 | Connect at 9600 8N2 | Opens without error, data echoes |

#### T-H-WS-04  Local echo toggle

| Step | Expectation |
|------|-------------|
| Connect with echo **off** (default) | Typed characters NOT locally echoed; appear only when loopback returns them |
| Disconnect; enable echo checkbox; reconnect | Typed characters appear immediately AND again from loopback (doubled) |

Note: local echo requires that `Terminal.vue` reads `localEcho` from settings
and writes keystrokes to `terminal.write()` in the `onData` handler. If not yet
wired, this test will fail — that is the expected gap to fix.

#### T-H-WS-05  Keyboard shortcuts and control characters

With the terminal focused and the Pico CDC loopback connected:

| Keystroke | Bytes sent (hex) | Loopback returns | Terminal display |
|-----------|-----------------|------------------|------------------|
| `A` | `0x41` | `0x41` | `A` |
| Backspace | `0x7F` | `0x7F` | DEL char (may display as `^?`) |
| Enter | `0x0D` | `0x0D` | Carriage return (cursor to column 0) |
| Ctrl+C | `0x03` | `0x03` | `^C` or nothing (control char) |
| Ctrl+D | `0x04` | `0x04` | `^D` or nothing |
| Ctrl+Z | `0x1A` | `0x1A` | `^Z` or nothing |
| Arrow Up | `ESC[A` | `ESC[A` | Cursor moves up in terminal |
| Arrow Down | `ESC[B` | `ESC[B` | Cursor moves down |
| Arrow Right | `ESC[C` | `ESC[C` | Cursor moves right |
| Arrow Left | `ESC[D` | `ESC[D` | Cursor moves left |
| F1 | `ESC OP` | reflected | Rendered without crash |
| Page Up (xterm) | not sent to serial | — | Terminal scrollback moves up |
| Page Down (xterm) | not sent to serial | — | Terminal scrollback moves down |

#### T-H-WS-06  xterm.js FitAddon — terminal resize

| Step | Expectation |
|------|-------------|
| Load app | Terminal fills the `.terminal-pane` div; no overflow or clipping |
| Resize browser window to a smaller size | Terminal reflows to new dimensions; no scroll-bars inside xterm canvas |
| Resize to larger | Terminal expands to fill space |

(FitAddon calls `fitAddon.fit()` on mount; window resize events must also call
`fit()` — if Terminal.vue does not wire a `ResizeObserver` or `window resize`
listener, this test will reveal the gap.)

#### T-H-WS-07  xterm.js WebLinksAddon — URL detection

| Step | Expectation |
|------|-------------|
| Inject text `"Visit https://example.com for docs"` into the readable stream | String appears in terminal |
| Hover over `https://example.com` | Underline or highlight appears (WebLinksAddon behaviour) |
| Click the URL | Browser opens the URL (or shows a tooltip) in a new tab |

For automated testing, inject the string via the mock readable stream; then
use `page.hover()` and `page.click()` on the URL text element.

#### T-H-WS-08  xterm.js scrollback buffer

| Step | Expectation |
|------|-------------|
| Send 2000 lines of text via loopback (script with newlines) | Terminal fills and scrolls |
| Shift+Page Up | Terminal scrolls back through buffer |
| Shift+Page Down | Terminal scrolls forward |
| Ctrl+Shift+Home | Jumps to top of scrollback |
| Ctrl+Shift+End | Jumps to bottom (current output) |

Playwright: use `page.keyboard.down('Shift')` + `page.keyboard.press('PageUp')`.

#### T-H-WS-09  xterm.js copy / paste

| Step | Expectation |
|------|-------------|
| Select text in terminal (drag or Shift+click) | Selection highlighted |
| Ctrl+Shift+C | Selected text copied to clipboard |
| Click in terminal; Ctrl+Shift+V | Clipboard text pasted into terminal; bytes sent over serial |
| Pasted text echoed by loopback | Pasted text appears in terminal output |

Playwright: use `page.keyboard.press('Control+Shift+C')` and
`page.evaluate(() => navigator.clipboard.readText())`.

#### T-H-WS-10  Auto-reconnect on page reload

| Step | Expectation |
|------|-------------|
| Connect to Pico CDC | Connected |
| Reload the page | `listPaired()` returns the already-authorised port |
| App mounts | Auto-reconnects; status message "Auto-reconnected to Web Serial" visible |
| Terminal receives loopback data | Data path fully restored |

#### T-H-WS-11  Settings persistence across reload

| Step | Expectation |
|------|-------------|
| Set baud to 9600, parity to even, flow to hardware, echo on | All reflected in UI |
| Reload | Settings restored from `localStorage`; same values shown |

#### T-H-WS-12  Disconnect while receiving data

| Step | Expectation |
|------|-------------|
| Connect; script continuous loopback stream | Data flowing to terminal |
| Click Disconnect mid-stream | Port closes cleanly; no "port is busy" error in console |
| Reconnect immediately | Works without refresh |

---

### §5  HIL — WebUSB FTDI backend (FTDI loopback plug)

Prerequisite: `ftdi_sio` unbound (`../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015`).
The tests in this section mirror the Web Serial section but use the
"WebUSB (FTDI)" backend. Differences from §4 are called out explicitly.

#### T-H-USB-01  Basic connect and echo

| Step | Expectation |
|------|-------------|
| Select "WebUSB (FTDI)" backend | Backend selector shows "WebUSB (FTDI)" |
| Click Connect → select FT231X device in device picker | Status: connected; Disconnect visible |
| Type `"HELLO"` | Bytes sent via `FtdiUart.writable` |
| FTDI loopback reflects bytes | `"HELLO"` appears in terminal |
| Click Disconnect | `FtdiUart.close()` called; USB interface released; no errors |

#### T-H-USB-02  Baud rate changes

Identical to T-H-WS-02 except the backend is "WebUSB (FTDI)".
Include `460800` and `921600` as the FTDI chip supports them reliably.

#### T-H-USB-03  Line settings with loopback

| Setting | Value | Step | Expectation |
|---------|-------|------|-------------|
| Data bits | 7 | Type 7-bit ASCII | Echoed correctly |
| Parity | odd | Connect at 9600 8O1 | Opens; data echoes |
| Stop bits | 2 | Connect at 9600 8N2 | Opens; data echoes |
| Flow control | hardware (RTS/CTS) | Connect | Opens without error; loopback plug's RTS→CTS wiring keeps flow enabled |

#### T-H-USB-04  Local echo toggle

Same as T-H-WS-04.

#### T-H-USB-05  Keyboard shortcuts and control characters

Same matrix as T-H-WS-05. The FTDI driver path is transparent to xterm.js.

#### T-H-USB-06  FitAddon, WebLinksAddon, scrollback, copy/paste

Same as T-H-WS-06 through T-H-WS-09. These are xterm.js features independent
of the backend.

#### T-H-USB-07  Auto-reconnect on page reload

| Step | Expectation |
|------|-------------|
| Connect to FTDI device | Connected |
| Reload page | `WebUsbFtdiFactory.listPaired()` returns the already-authorised device |
| App mounts | Auto-reconnects; status message "Auto-reconnected to WebUSB (FTDI)" |

#### T-H-USB-08  Backend switch

| Step | Expectation |
|------|-------------|
| Connect via WebUSB FTDI; disconnect | Backend selector enabled |
| Switch selector to "Web Serial" | Backend preference written to `localStorage` |
| Click Connect | Web Serial device picker opens for the Pico CDC device |
| Connect to Pico CDC | Connected; data echoes |

---

### §6  Cross-cutting HIL checks

#### T-H-X-01  Both devices in one session

| Step | Expectation |
|------|-------------|
| Run T-H-WS-01 (Pico CDC, Web Serial) | Passes |
| Without reloading, run T-H-USB-01 (FTDI, WebUSB) | Passes — no state leak between backends |

#### T-H-X-02  Preflight gate

| Step | Expectation |
|------|-------------|
| Run `npm run test:hw` with a device physically disconnected | `pretest:hw` fails with clear device-absent message; Playwright never starts |

---

## Pass criteria summary

| Tier | Command | Required result |
|------|---------|-----------------|
| Unit | `npm test` | All tests pass, 0 errors |
| E2E mocked | `npm run test:e2e` | All tests pass |
| HIL Web Serial | `TERMINAL_HW_TEST=1 npm run test:hw` | T-H-WS-01 through T-H-WS-12 pass |
| HIL WebUSB FTDI | `TERMINAL_HW_TEST=1 npm run test:hw` | T-H-USB-01 through T-H-USB-08 pass |
| TypeScript | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | `dist/` produced with only relative asset paths |

---

## Known gaps (tests that will fail until fixed)

| ID | Gap | Fix location |
|----|-----|--------------|
| T-H-WS-04 / T-H-USB-04 | Local echo not wired: `settings.localEcho` is persisted but `Terminal.vue` does not read it or echo keystrokes locally | `Terminal.vue` `onData` handler; `App.vue` must pass `localEcho` prop |
| T-H-WS-06 / T-H-USB (FitAddon resize) | `fitAddon.fit()` called once on mount; no `ResizeObserver` or `window resize` listener wires subsequent resizes | `Terminal.vue` `onMounted`; add `new ResizeObserver(() => fitAddon.fit())` on the container |
| T-E-01 | `e2e/smoke.spec.ts` is a placeholder (`about:blank` test) | Replace with real page-load assertion |
