# PHASE-07-e2e-acceptance.md

Branch: `phase/07-e2e-acceptance`

## Goal

Write the full Playwright E2E acceptance suite, covering all UI controls,
all xterm.js features, and all settings/reconnect behaviours — using mocked
browser APIs throughout.

---

## Critical Pi5 constraint

**Real USB device selection cannot be automated from Playwright's headless
Chromium on the Raspberry Pi 5.** CDP `DeviceAccess` events do not fire in
`headless_shell`. See `docs/PLAYWRIGHT.md §7` for the full explanation.

Consequence:

- **All Playwright tests in this phase use `addInitScript` mocks.** They
  exercise real xterm.js rendering, real Vue reactivity, real settings
  persistence — just with a fake serial port/USB device behind the backend.
- **Real hardware validation** is covered by:
  1. `ftdi-webusb-driver test:hw` (Node.js, no browser picker needed)
  2. Manual browser smoke tests per `docs/MANUAL-SMOKE.md`

The `@hardware` tag in this phase means *hardware-like scenario* (large data,
edge cases), not *real USB device*. These tests still use the mock backend.

---

## Step 7.1 — Mock helpers

### `e2e/helpers/mockSerial.ts`

Installs a fake `navigator.serial` via `page.addInitScript()` using the
injection pattern from `docs/PLAYWRIGHT.md`.

```ts
export async function installMockSerial(page: Page): Promise<void>
```

- Exposes `window.__pushFromDevice(bytes: number[])` — enqueues incoming bytes
- Exposes `window.__getDeviceWrites(): number[][]` — returns bytes the app wrote
- `requestPort()` and `getPorts()` return the same fake port object
- `open()` / `close()` are no-ops

### `e2e/helpers/mockUsb.ts`

Installs a fake `navigator.usb` using **Approach B** from `docs/PLAYWRIGHT.md`:
replace the factory object in `window.__webusbFactory` before Vue mounts.

```ts
export async function installMockUsb(page: Page): Promise<void>
```

- Same `__pushFromDevice` / `__getDeviceWrites` interface as mockSerial
- `isAvailable()` returns true
- `pickDevice()` / `listPaired()` return the mock backend directly

The app's `src/main.ts` must check for `window.__webusbFactory` and use it if
present (test-only escape hatch):

```ts
// src/main.ts — add after app.provide(FACTORIES_KEY, ...)
if ((window as any).__webusbFactory) {
  app.provide(WEBUSB_FACTORY_KEY, (window as any).__webusbFactory)
}
```

Add `WEBUSB_FACTORY_KEY` injection key to `src/backends/injectionKeys.ts`.

### `e2e/fixtures.ts`

```ts
import { test as base } from '@playwright/test'
import { installMockSerial } from './helpers/mockSerial'
import { installMockUsb } from './helpers/mockUsb'

export const test = base.extend({
  mockedPage: async ({ page }, use) => {
    await installMockSerial(page)
    await installMockUsb(page)
    await page.goto('/')
    await use(page)
  },
})
export { expect } from '@playwright/test'
```

### Commits

```
feat(e2e): add mockSerial helper with push/poll interface
feat(e2e): add mockUsb helper using Approach B factory replacement
feat(e2e): add Playwright fixtures with mockedPage
```

---

## Step 7.2 — Connect / disconnect suite (`e2e/connect.spec.ts`)

| Test | Steps | Assert |
|------|-------|--------|
| Web Serial connect → disconnect | Select Web Serial; click Connect | Disconnect button visible; all settings disabled |
| WebUSB connect → disconnect | Select WebUSB; click Connect | Same |
| Disconnect cleans up | Connect; Disconnect | Connect button visible; settings enabled |
| Picker cancelled (no device) | Override `requestPort` to reject | Connect button still visible; no error thrown |
| Status message cleared on disconnect | Connect (auto-reconnect); Disconnect | Status message gone |

### Commits

```
test(e2e): cover connect/disconnect flow for both backends
```

---

## Step 7.3 — Settings suite (`e2e/settings.spec.ts`)

| Test | Steps | Assert |
|------|-------|--------|
| All 6 controls present | Load page | baud-select, databits-select, parity-select, stopbits-select, flowcontrol-select, echo-checkbox all visible |
| Baud select has 12 options | Inspect options | 300, 1200, …, 921600 |
| Change baud → persists | Set to 9600; reload | 9600 selected |
| Change parity → persists | Set to odd; reload | odd selected |
| Change flow → persists | Set to hardware; reload | hardware selected |
| Echo toggle → persists | Check echo; reload | checked |
| Reset restores defaults | Change all; click Reset | 115200, 8, none, 1, none, unchecked |
| All controls disabled while connected | Connect | `disabled` attribute on all controls |
| Controls re-enabled after disconnect | Disconnect | `disabled` removed |

### Commits

```
test(e2e): cover all settings controls, persistence, and lock-while-connected
```

---

## Step 7.4 — Terminal / xterm.js suite (`e2e/terminal.spec.ts`)

Uses `mockedPage` fixture + `__pushFromDevice`.

| Test | Steps | Assert |
|------|-------|--------|
| Device bytes rendered in terminal | Connect; push `[72,69,76,76,79]` (HELLO) | `.xterm-rows` contains "HELLO" |
| ANSI escape: bold | Push `[0x1b,0x5b,0x31,0x6d,'A','B','C',0x1b,0x5b,0x30,0x6d]` | "ABC" visible (bold styling on spans) |
| ANSI escape: colour | Push `ESC[32m` + "GREEN" + `ESC[0m` | "GREEN" visible |
| URL detection | Push text "See https://example.com here" | xterm renders; hovering the URL triggers underline via WebLinksAddon |
| Scrollback — Shift+PageUp | Push 2000 newline-separated lines; `keyboard.down('Shift'); keyboard.press('PageUp')` | Scrollbar position changes (terminal scrolled up) |
| Ctrl+C sends 0x03 | Click terminal; press Ctrl+C | `__getDeviceWrites` contains `[0x03]` |
| Ctrl+D sends 0x04 | Press Ctrl+D | `__getDeviceWrites` contains `[0x04]` |
| Arrow Up sends ESC[A | Press ArrowUp | Writes contain `[0x1b, 0x5b, 0x41]` |
| Enter sends CR (0x0D) | Press Enter | Writes contain `[0x0d]` |
| Copy selection (Ctrl+Shift+C) | Push text; select it; Ctrl+Shift+C | Clipboard matches selected text |
| Paste (Ctrl+Shift+V) | Set clipboard; Ctrl+Shift+V | `__getDeviceWrites` contains pasted bytes |

Note: xterm.js uses a DOM renderer by default in jsdom. Playwright tests run in
real Chromium. The `.xterm-rows` selector is the accessibility layer that
xterm populates for screen readers and Playwright assertions.

### Commits

```
test(e2e): cover xterm rendering, ANSI sequences, URL links, keyboard shortcuts
test(e2e): cover scrollback, copy, paste
```

---

## Step 7.5 — Local echo suite (`e2e/echo.spec.ts`)

| Test | Steps | Assert |
|------|-------|--------|
| Echo off (default) | Connect; type "X"; do not push from device | "X" NOT in `.xterm-rows` yet |
| Echo off → appears after device echoes | Push `[0x58]` (X); | "X" appears |
| Echo on | Enable echo; connect; type "X" | "X" appears immediately in `.xterm-rows` without a device push |
| Echo on — still sent to device | Enable echo; connect; type "X" | `__getDeviceWrites` contains `[0x58]` |

### Commits

```
test(e2e): cover local echo on/off behaviour
```

---

## Step 7.6 — Backend selector suite (`e2e/backend.spec.ts`)

| Test | Steps | Assert |
|------|-------|--------|
| Both backends available | Load with both mocks | Selector shows "Web Serial" and "WebUSB (FTDI)" |
| Only Web Serial available | Load with only `installMockSerial` (no USB mock) | Only "Web Serial" shown |
| No backends | Load with neither mock | "This browser doesn't support serial-over-USB" message |
| Selection persists | Select "WebUSB (FTDI)"; reload | "WebUSB (FTDI)" selected |
| Selector disabled while connected | Connect; inspect selector | `disabled` attribute |

### Commits

```
test(e2e): cover backend selector availability, persistence, and locking
```

---

## Step 7.7 — Auto-reconnect suite (`e2e/reconnect.spec.ts`)

| Test | Steps | Assert |
|------|-------|--------|
| Auto-reconnect on mount | Seed `listPaired()` to return one device; reload | "Auto-reconnected to …" status message visible |
| Settings applied on auto-reconnect | Set baud 9600; reload | Backend opened with baud 9600 |
| No paired device — silent | `listPaired()` returns `[]` | No status message; connect button visible |

### Commits

```
test(e2e): cover auto-reconnect on mount and no-device-found path
```

---

## Step 7.8 — `@hardware` extended mock tests

These run only when `TERMINAL_HW_TEST=1`. They still use mocked backends.

Add to the suites above (not a separate file):

| Test | Scenario |
|------|----------|
| Large data volume (`@hardware`) | Push 100 000 bytes in 1 000-byte chunks; assert terminal is stable and readable at the end |
| Disconnect mid-stream (`@hardware`) | Start pushing data via `setInterval`; click Disconnect mid-push; assert no console errors, Connect button visible |
| Immediate reconnect (`@hardware`) | Disconnect; immediately click Connect; assert reconnects cleanly |

### Commits

```
test(e2e): add @hardware-tagged extended mock scenarios
```

---

## Step 7.9 — `docs/MANUAL-SMOKE.md`

Create `terminal-app/docs/MANUAL-SMOKE.md` documenting the step-by-step
protocol for manually verifying real hardware in a browser. See that file
for the full content.

### Commit

```
docs(e2e): add manual browser smoke test protocol for real hardware
```

---

## Acceptance criteria

- [ ] All new Playwright tests pass: `npm run test:e2e`
- [ ] `@hardware` tests pass: `TERMINAL_HW_TEST=1 npm run test:hw`
- [ ] Both mocked backends exercise the real `FtdiUart` translation layer
- [ ] Manual smoke tests per `docs/MANUAL-SMOKE.md` pass on real hardware
- [ ] `npm test` (Vitest) still passes — no regressions from `main.ts` change
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] Branch merged into main with `--no-ff`
