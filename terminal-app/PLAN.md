# PLAN.md — unified-serial-console (the terminal app)

A phased, test-first plan for building a browser terminal from scratch
with two interchangeable serial backends: **Web Serial API** and
**WebUSB + the `ftdi-webusb-driver` library**.

Each phase is a feature branch. Within a phase, work in red → green →
refactor cycles, committing at each transition.

## Reference reading before Phase 0

Before writing any code, read [zaxbux/web-serial-console](https://github.com/zaxbux/web-serial-console)
end-to-end. Pay attention to:

- How the Vue components are organised (App, Terminal, Settings, etc.)
- How xterm.js is wired into a Vue component lifecycle
- The state machine for connect / disconnect / error
- The settings-panel structure

Do **not** copy code from it. The goal of reference reading is to
internalise the design, then re-derive it under test discipline. This
keeps the codebase entirely covered by tests written first.

## Acceptance criteria for "phase complete"

1. All tests in the phase pass on `npm test`.
2. `npm run typecheck` is clean.
3. `npm run lint` is clean.
4. `npm run build` produces a working dist.
5. Manual smoke test passes for the behaviour the phase added.
6. Phase document (or PLAN.md) updated with any deviations.
7. Branch merged into `main` with `--no-ff`.

---

## Phases checklist

Single source of truth for status (supersedes the former `PLAN-UPDATED.md`).
Phases 0–10 shipped; current release **v1.2.0**, live on staging
(`serial-lab.test.delivery-academy.se`). Hardware smoke tests were exercised on
the Raspberry Pi 5 + FTDI host.

| Phase | Name | Status |
|------:|------|--------|
| 0 | Project scaffold and empty terminal shell | ✅ Complete |
| 1 | Define the SerialBackend interface | ✅ Complete |
| 2 | Web Serial backend and basic connection flow | ✅ Complete |
| 3 | WebUSB + FTDI backend | ✅ Complete (HW smoke run on Pi5) |
| 4 | Backend selector UI | ✅ Complete |
| 5 | Settings persistence and auto-reconnect | ✅ Complete |
| 6 | Terminal completeness | ✅ Complete |
| 7 | E2E Playwright acceptance tests | ✅ Complete |
| 8 | Polish, deployment, release | ✅ Complete (deploy live; CI on Agentlab1) |
| 9 | Terminal UX & theming (v1.1.0) | ✅ Complete |
| **10** | **Toolbar & connection UX** | ✅ Complete (v1.2.0) — [`docs/phases/PHASE-10-toolbar-connection-ux.md`](docs/phases/PHASE-10-toolbar-connection-ux.md) |
| **11** | **Terminal behaviours & polish** | 🔜 Planned — [`docs/phases/PHASE-11-terminal-behaviors.md`](docs/phases/PHASE-11-terminal-behaviors.md) |

Post-9 point releases (bug fixes, no new phase): v1.1.1 drawer occlusion;
v1.1.2 serial stream-lifecycle (writer-lock teardown); v1.1.3 rename to
`unified-serial-console`; v1.1.4 drawer scroll; v1.1.5 sticky manual disconnect.

### Phase 10 work items (Toolbar & connection UX)

- [x] 10A — Toolbar clicks return focus to the terminal (`withTerminalFocus`). Unit
      tests landed with the implementation commit; Playwright focus assertions for
      Clear and drawer-close added retrospectively on the branch before 10C.
- [x] 10B — Rename to **"Serial connect:"** + unified paired-device dropdown
      (Web Serial + WebUSB-FTDI + "Request…" actions). `BackendSelector` →
      `ConnectionSelect`; backends carry a VID:PID `label`; the dropdown lists
      already-paired devices (refreshed on focus) plus per-backend Request
      actions, and Connect opens the chosen paired device directly or pops the
      picker. The Connect/Disconnect button and `connect()` flow are unchanged
      (full toolbar reflow stays in 10G). The "backend selector" unit/e2e tests
      were renamed to "connection selector" here since the rename forced it.
- [x] 10C — Baud rate as a toolbar dropdown (out of the settings drawer). Compact
      `.toolbar__select` in the toolbar group between ConnectionSelect and
      Connect; removed from the drawer's Connection section.
- [x] 10D — **Serial Settings** dropdown (data/parity/stop/flow/echo/reset).
- [x] 10E — **Download** button → terminal contents as a text file.
- [x] 10F — **Fullscreen** button (native Fullscreen API).
- [x] 10G — Toolbar reflow + focus wired through every button.

### Phase 11 work items (Terminal behaviours & polish)

- [x] 11A — Valid URLs clickable in the terminal (verified + e2e click test).
- [x] 11B — **Bell**: `bell` on/off + `bellStyle` none/visual/sound/both (zaxbux parity).
- [x] 11C — Add `@xterm/addon-search` (find) + reuse `@xterm/addon-serialize`;
      optional `@xterm/addon-unicode11`. Decline Vuetify/Pinia/router/@vueuse/@mdi.
- [x] 11D — **Splash** overlay in the terminal pane; clears on first typed/received byte.
- [ ] 11E — **Forget paired devices** button in Settings drawer: `port.forget()` + `usb.forgetDevice()` for all saved entries, then refreshes the dropdown.

> Deferred-item audit (per "integrate non-obsolete prior planning"): the former
> `PLAN-UPDATED.md` "outstanding" list (deploy, `git push`, HW smoke) is now
> **obsolete** — all done. No other deferred items from Phases 6–9 remain open;
> Phase 9's only "stretch" note is captured here under Phase 11.

---

## Phase 0 — Project scaffold and empty terminal shell

Branch: `phase/00-scaffold`

**Goal:** A buildable, testable Vue 3 + Vite + TS app that renders an
empty terminal pane, a disabled Connect button, and a settings panel
shell. No serial code yet. No backends defined yet. Just confirm the
toolchain and the UI shell work.

### Sub-steps

1. **Project init**
   - `npm create vite@latest . -- --template vue-ts` (interactive: skip
     all the optional add-ons except TypeScript)
   - `npm install`
   - Delete the default `HelloWorld.vue` and template content
   - Verify `npm run dev` opens a blank page in the browser

2. **Toolchain**
   - Add Vitest: `npm install -D vitest @vue/test-utils jsdom @vitest/coverage-v8`
   - Add Playwright: `npm install -D @playwright/test`; run `npx playwright install chromium`
   - Add ESLint + Prettier: `npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-vue prettier`
   - Add `.eslintrc.cjs`, `.prettierrc`, `.editorconfig` matching the
     library repo's config (Vue overlay)
   - Add npm scripts: `test`, `test:watch`, `test:e2e`, `typecheck`,
     `lint`, `format`, `build`, `preview`
   - **Configure Vite for static deployment.** Edit `vite.config.ts`:
     ```ts
     export default defineConfig({
       plugins: [vue()],
       base: './',  // relative paths so the same dist/ works at any URL subpath
     });
     ```
     This is the key to "no Node.js needed on the web server" — `npm run build`
     produces a `dist/` folder of pure static assets that drop straight into any
     Apache or nginx document root (or a subfolder of one). See
     `docs/DEPLOYMENT.md` for the full deploy procedure.

3. **xterm.js terminal pane**
   - `npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links`
   - Write the failing test first: `src/components/Terminal.test.ts`
     mounts the component and asserts the xterm instance is created and
     attached to the DOM (jsdom + spy on xterm constructor)
   - Implement `src/components/Terminal.vue`: a wrapping `<div>` with a
     ref, an `onMounted` that `new Terminal({...}).open(div)`, an
     `onUnmounted` that calls `terminal.dispose()`
   - Smoke test: `npm run dev`, see a working empty terminal pane

4. **App shell**
   - Failing test: `src/App.test.ts` asserts that App renders
     Terminal, a Connect button (initially disabled — no backend
     registered yet), and a Settings panel placeholder
   - Implement `src/App.vue` with those three children
   - Add minimal CSS for layout (flex column: header with controls,
     terminal taking remaining space)

5. **CI-readiness**
   - Add `.github/workflows/ci.yml` (or `.gitlab-ci.yml` since the
     user runs GitLab CE) that runs `lint`, `typecheck`, `test`, `build`
     on every push and PR. Use the user's GitLab runner if available.

### Commits (representative)

- `chore(proj): scaffold Vue 3 + Vite + TS via create-vite`
- `chore(proj): add Vitest, Playwright, ESLint, Prettier`
- `chore(proj): add npm scripts and editor config`
- `test(terminal): assert xterm instance is created and attached`
- `feat(terminal): wrap xterm.js in a Vue component with lifecycle`
- `test(ui): assert App renders Terminal, Connect, Settings placeholder`
- `feat(ui): implement App shell with empty Settings and disabled Connect`
- `style(ui): basic flex layout for header + terminal`
- `chore(ci): add GitLab CI pipeline`

### Acceptance

- [ ] `npm run dev` shows an empty terminal pane plus controls
- [ ] All scripts (`test`, `typecheck`, `lint`, `build`) pass clean
- [ ] CI pipeline green on push to feature branch
- [ ] Branch merged

---

## Phase 1 — Define the SerialBackend interface

Branch: `phase/01-backend-interface`

**Goal:** Add `src/backends/SerialBackend.ts` defining the abstraction
that both backend implementations will satisfy.

The interface deliberately matches the **Web Serial API's `SerialPort`
shape** as closely as possible, so the Web Serial implementation in
Phase 2 is a thin adapter and so anyone fluent in Web Serial finds it
familiar.

```ts
// src/backends/SerialBackend.ts

export type BackendId = 'web-serial' | 'webusb-ftdi';

export interface SerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  parity?: 'none' | 'even' | 'odd';
  stopBits?: 1 | 2;
  flowControl?: 'none' | 'hardware';
  // XON/XOFF deliberately omitted — Web Serial doesn't expose it.
  // ftdi-webusb-driver supports it; can be added later if needed.
}

export interface SerialBackend {
  readonly id: BackendId;
  readonly label: string;
  readonly isOpen: boolean;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

export interface SerialBackendFactory {
  readonly id: BackendId;
  readonly displayName: string;
  isAvailable(): boolean;
  pickDevice(): Promise<SerialBackend>;
  listPaired(): Promise<SerialBackend[]>;
}
```

### Sub-steps

1. Failing test (`src/backends/SerialBackend.test.ts`) that imports the
   types and exercises a `MockSerialBackend` implementation: starts
   `isOpen: false`, flips on `open()`, flips back on `close()`,
   readable yields what's pushed through a test `TransformStream`,
   writable records writes.
2. Implement `src/backends/SerialBackend.ts` (types only)
3. Implement `src/backends/MockSerialBackend.ts` for use across
   all subsequent phases' tests
4. Verify the mock passes the contract test

### Commits

- `test(backend): assert SerialBackend interface contract via mock`
- `feat(backend): define SerialBackend and SerialBackendFactory types`
- `feat(backend): implement MockSerialBackend for tests`

### Acceptance

- [ ] Interface types compile under strict mode
- [ ] MockSerialBackend passes contract test
- [ ] No behavioural change in the running app (no factory registered yet)

---

## Phase 2 — Web Serial backend and basic connection flow

Branch: `phase/02-web-serial-backend`

**Goal:** Implement `WebSerialBackend` and `WebSerialFactory`,
register the factory with the app, wire the Connect button to call
`pickDevice()` and `open()`, then pipe `readable` into the terminal
and pipe terminal keystrokes into `writable`. By the end of this
phase, the app is a working Web Serial terminal.

### Sub-steps

1. **Factory tests (mock `navigator.serial`)**
   - `WebSerialFactory.isAvailable()` returns `'serial' in navigator`
   - `WebSerialFactory.pickDevice()` calls `navigator.serial.requestPort()`
     with no filters and wraps the returned port in a `WebSerialBackend`
   - `WebSerialFactory.listPaired()` calls `navigator.serial.getPorts()`
     and wraps each in a `WebSerialBackend`

2. **Factory implementation**

3. **Backend tests (fake SerialPort)**
   - `open(options)` calls `port.open(options)`
   - `close()` calls `port.close()` and flips `isOpen`
   - Data forwarded from `port.readable` to `backend.readable` (pump approach)
   - `writable` is `port.writable`
   - Calling `close()` while a reader is locked releases the lock first
     (a common Web Serial footgun)

4. **Backend implementation**
   - **Deviation from plan:** `WebSerialBackend` wraps `port.readable` via
     an internal pump task (instead of exposing `port.readable` directly).
     This lets `close()` cancel the pump and release `port.readable`'s lock
     before calling `port.close()`, cleanly avoiding the "port is busy" error.
     `backend.readable` is a new stream fed by the pump; `backend.writable`
     is `port.writable` directly. Local `WsSerialPort`/`WsSerial` interfaces
     were added because TypeScript's DOM lib does not include Web Serial types.

5. **Wire into App**
   - Register `WebSerialFactory` via `provide`/`inject` (injection key in
     `src/backends/injectionKeys.ts`; provided in `main.ts`)
   - Connect button: calls `pickDevice()` then `backend.open(settings)`;
     passes `backend.readable` and `backend.writable` as props to Terminal
   - **Deviation from plan:** Piping is handled by Terminal.vue (via
     `readable`/`writable` props with internal watchers), not by App.vue's
     connect handler. App.vue only passes the streams as props; Terminal
     starts/stops the read loop when the prop changes.
   - Disconnect button: `backend.close()` then clear backend ref

6. **Manual smoke test**
   - Plug in any USB-serial device (or use a Linux pty pair if no
     hardware available); click Connect, type, see characters echo (if
     loopback) or pass to the attached MCU

### Commits (actual)

- `test(web-serial): cover WebSerialFactory availability and pickDevice`
- `feat(web-serial): implement WebSerialBackend and WebSerialFactory`
- `test(terminal): cover readable/writable pipe and onData emit`
  (includes Terminal.vue update with readable/writable props)
- `feat(ui): wire Connect/Disconnect to factory and pipe streams to Terminal`
  (includes main.ts WebSerialFactory provide)
- `fix(web-serial): define local WsSerialPort/WsSerial types for build`

### Acceptance

- [x] App opens a Web Serial device end-to-end on real hardware
- [x] Disconnect releases the port cleanly (no console errors)
- [x] All tests pass; lint and typecheck clean
- [x] Branch merged

---

## Phase 3 — WebUSB + FTDI backend

Branch: `phase/03-webusb-ftdi-backend`

**Goal:** Add `WebUsbFtdiBackend` and `WebUsbFtdiFactory` using the
`ftdi-webusb-driver` library, satisfying the same `SerialBackend` interface.
No UI changes yet — that's Phase 4. By the end of this phase, the
backend exists, is fully tested, and can be exercised manually by
swapping which factory is registered in the app composition root.

### Sub-steps

1. **Add dependency**
   - `npm install file:../ftdi-driver` (or whatever path matches your
     workspace layout — adjust if Claude Code's VM has them elsewhere)
   - Verify the library's types are visible in your TS setup

2. **Factory tests (mock `navigator.usb`)**
   - `isAvailable()` returns `'usb' in navigator`
   - `pickDevice()` calls
     `navigator.usb.requestDevice({ filters: [{ vendorId: 0x0403, productId: 0x6015 }] })`
     and wraps the returned device in a `WebUsbFtdiBackend`
   - `listPaired()` calls `navigator.usb.getDevices()`, filters to
     FTDI VID, and wraps each one

3. **Factory implementation**

4. **Backend tests (use library's MockUsbTransport)**
   - Construct an `FtdiUart` against `MockUsbTransport`, wrap it in
     `WebUsbFtdiBackend`, assert that `open(options)` translates and
     forwards to `FtdiUart.configure()`
   - Assert that `readable`/`writable` are `FtdiUart`'s streams
   - Assert `close()` calls `FtdiUart.close()` and flips `isOpen`

5. **Option translation**
   - `parity: 'none' | 'even' | 'odd'` → `'none' | 'even' | 'odd'`
   - `flowControl: 'none' | 'hardware'` → `'none' | 'rtscts'`
   - DTR and RTS default to asserted (matches Web Serial behaviour)

6. **Backend implementation**

7. **Manual smoke test**
   - Bind WinUSB to an FT231XS via Zadig (Windows) or set udev rules
     (Linux). Temporarily swap the factory in the app root from
     WebSerial to WebUsbFtdi. Click Connect, see the FT231XS appear in
     the WebUSB chooser, connect, exchange bytes with the attached MCU
   - Swap the factory back to WebSerial when done

### Notes on implementation

- Added `@types/w3c-web-usb` as a dev dependency alongside the library,
  and added `"w3c-web-usb"` to `tsconfig.app.json`'s `types` array so the
  `USBDevice` type is available in production code.
- `WebUsbFtdiBackend` accepts a pre-constructed `FtdiUart` (rather than a
  `USBDevice`). The factory creates `FtdiUart(new WebUsbTransport(device))`;
  tests use `FtdiUart(new MockUsbTransport())`. No `USBDevice` is needed at
  the backend level, only in the factory.
- `listPaired()` filters `getDevices()` results to FTDI VID (0x0403).

### Commits (actual)

- `chore(proj): add ftdi-webusb-driver and @types/w3c-web-usb dependencies`
- `test(webusb): cover WebUsbFtdiFactory and WebUsbFtdiBackend`
  (includes WebUsbFtdiBackend.ts implementation; option translation included)

### Acceptance

- [x] Backend passes contract test using library's MockUsbTransport
- [ ] Manual smoke test exchanges bytes with real FT231XS hardware
- [x] Branch merged

---

## Phase 4 — Backend selector UI

Branch: `phase/04-backend-selector`

**Goal:** Add a dropdown (or segmented control) above the Connect
button that lets the user choose **Web Serial** or **WebUSB (FTDI)**
before clicking Connect. The Connect button then calls the selected
factory's `pickDevice()`.

### Behaviour rules

- The dropdown only shows backends whose `isAvailable()` returns true
  on the current browser. If neither is available, show a clear
  message ("This browser doesn't support serial-over-USB; use Chromium").
- The selection persists in `localStorage` (key `backend.preferredId`).
- If the persisted backend is no longer available (e.g. saved as
  WebUSB on a browser that doesn't support it), fall back to the first
  available one.
- The selection is locked while a connection is open. Disconnect first
  to switch backends.

### Sub-steps

1. Test-first: `src/settings/backendPreference.test.ts` covering read,
   write, fallback when invalid, and clear paths
2. Implement `src/settings/backendPreference.ts` using `localStorage`
3. Test-first: backend selector component renders only available
   backends, emits change events, disables while connected
4. Implement `src/components/BackendSelector.vue`
5. Wire selector into App
6. E2E Playwright smoke test: mock both globals, assert dropdown
   options and that selection survives reload

### Commits

- `test(settings): cover backendPreference read/write/fallback`
- `feat(settings): implement backendPreference store`
- `test(ui): backend selector shows only available backends`
- `feat(ui): implement BackendSelector component`
- `feat(ui): lock selector while connection is open`
- `style(ui): polish selector layout`
- `test(e2e): backend selection survives reload`

### Notes on implementation

- Single `FACTORY_KEY` replaced by `FACTORIES_KEY: InjectionKey<SerialBackendFactory[]>`;
  `FACTORY_KEY` retained with `@deprecated` jsdoc.
- `BackendSelector.vue` filters `factories` to available ones; shows a
  browser-compatibility message when none are available.
- `backendPreference.ts` is a pure module (no Vue reactivity) used by both
  App.vue (to initialise `selectedId`) and `BackendSelector` indirectly via App.
- App.vue `watch(selectedId)` persists selection; `resolveFactory()` at init
  picks the preferred or first available factory.

### Commits (actual)

- `test(settings): cover backendPreference read/write/fallback`
  (includes backendPreference.ts implementation)
- `test(ui): backend selector shows only available backends`
  (includes BackendSelector.vue implementation)
- `feat(ui): wire BackendSelector into App with FACTORIES_KEY`
  (App.vue, App.test.ts, injectionKeys.ts, main.ts all updated)

### Acceptance

- [x] Dropdown reflects browser capability
- [x] Selection persists across reloads
- [x] Selector disabled during active connection
- [x] Branch merged

---

## Phase 5 — Settings persistence and auto-reconnect

Branch: `phase/05-persistence-reconnect`

**Goal:** The user's last baud rate, data bits, parity, stop bits,
flow control, local echo, and **selected backend** survive a reload.
On reload, if the selected backend has a previously-authorised device
(via `listPaired()`), automatically reconnect to it with the saved
settings.

### Sub-steps

1. Test-first: pure read/write functions for each setting, round-trip
   through `localStorage`
2. Implement `src/settings/useSettings.ts` composable
3. Wire `useSettings()` into the existing settings UI (created in
   Phase 0's placeholder, populated incrementally — actually, since
   we put just a placeholder in Phase 0, this phase is also where the
   settings UI gets its real implementation)
4. Test-first: auto-reconnect logic with mocked factories — given a
   non-empty `listPaired()` result, the app opens the first one with
   the saved settings on mount
5. Implement auto-reconnect in App's `onMounted`
6. Surface state to UI: "auto-reconnected to {label}", "no previous
   device found, click Connect to pick one"

### Notes on implementation

- `useSettings.ts` uses a deep watcher to persist changes; a `skipNextSave`
  flag prevents `reset()` from immediately writing defaults back to storage.
- Settings panel and auto-reconnect tests were added to App.test.ts alongside
  existing connection-flow tests rather than a separate file — the mock
  `AutoReconnectMockFactory` has `listPaired()` return a pre-made backend.
- `MockSerialBackend` was extended with `lastOptions` to verify that connect
  passes the current settings rather than hardcoded defaults.
- "No previous device" path surfaces no message (empty; users click Connect).

### Commits (actual)

- `test(settings): round-trip all settings through localStorage`
  (includes useSettings.ts implementation)
- `feat(settings): populate settings panel and wire auto-reconnect`
  (settings controls in App.vue, auto-reconnect onMounted, status message)

### Acceptance

- [x] All settings round-trip cleanly
- [ ] Auto-reconnect works for both backends on real hardware
- [x] Reset-to-defaults clears localStorage
- [x] Branch merged

---

## Phase 6 — Terminal completeness

Branch: `phase/06-terminal-completeness`

**Goal:** Fix two functional gaps discovered by the TEST-PLAN.md review and
replace the E2E smoke test placeholder with real assertions.

See `docs/phases/PHASE-06-terminal-completeness.md` for the full step-by-step.

### Gaps to fix

1. **Local echo not wired** — `settings.localEcho` is persisted but never read
   by `Terminal.vue`. App.vue must pass `:local-echo` prop; Terminal must echo
   keystrokes to `terminal.write()` when the prop is true.

2. **FitAddon has no ResizeObserver** — `fitAddon.fit()` is called once on mount.
   Terminal.vue must attach a `ResizeObserver` on the container div so the xterm
   canvas reflows when the browser window is resized.

3. **E2E smoke test is a placeholder** — `e2e/smoke.spec.ts` navigates to
   `about:blank`. Replace with assertions against the running dev server:
   page title, backend selector visible, Connect button disabled, terminal pane
   sized.

### Commits (representative)

- `test(terminal): assert local echo writes keystroke to terminal when enabled`
- `feat(terminal): wire localEcho prop to echo keystrokes before sending`
- `test(terminal): assert ResizeObserver wires fitAddon.fit on container resize`
- `feat(terminal): add ResizeObserver to refit xterm on container size change`
- `test(e2e): replace about:blank placeholder with real app smoke test`

### Acceptance

- [ ] Local echo on → keystroke appears immediately in terminal
- [ ] Local echo off → keystroke absent until device echoes back
- [ ] Resizing browser window causes terminal to reflow to fill pane
- [ ] `npm run test:e2e` passes with real smoke test
- [ ] `npm test` passes
- [ ] `npm run typecheck` and `npm run lint` clean
- [ ] Branch merged

---

## Phase 7 — E2E Playwright acceptance tests

Branch: `phase/07-e2e-acceptance`

**Goal:** Write the full Playwright E2E acceptance suite using `addInitScript`
mocked backends. Covers all UI controls, all xterm.js features, settings
persistence, and auto-reconnect. Also documents the manual browser smoke
protocol for real hardware.

**Key constraint:** Real USB device selection cannot be automated from
Playwright's headless Chromium on the Pi5 (CDP `DeviceAccess` events don't
fire in `headless_shell` — see `docs/PLAYWRIGHT.md §7`). All tests use mocked
backends. Real hardware validation is covered by `ftdi-webusb-driver test:hw`
and `docs/MANUAL-SMOKE.md`.

See `docs/phases/PHASE-07-e2e-acceptance.md` for the full step-by-step.

### Sub-steps

1. Mock helpers: `e2e/helpers/mockSerial.ts`, `e2e/helpers/mockUsb.ts` (Approach B per PLAYWRIGHT.md)
2. `e2e/fixtures.ts` — `mockedPage` fixture installing both mocks
3. `e2e/connect.spec.ts` — connect/disconnect, error handling, status messages
4. `e2e/settings.spec.ts` — all 6 controls, persistence, lock-while-connected, reset
5. `e2e/terminal.spec.ts` — xterm rendering, ANSI sequences, URL links, scrollback, keyboard shortcuts, copy/paste
6. `e2e/echo.spec.ts` — local echo on/off
7. `e2e/backend.spec.ts` — backend selector, availability, persistence, switching
8. `e2e/reconnect.spec.ts` — auto-reconnect on mount
9. `@hardware`-gated extended mock tests (large data, mid-stream disconnect, immediate reconnect)
10. `docs/MANUAL-SMOKE.md` — manual browser smoke protocol for real hardware

### Notes on implementation

- Both mock helpers share a single `window.__mockIO` infrastructure (idempotent
  guard in each helper) so `__pushFromDevice` / `__getDeviceWrites` work regardless
  of which backend is active.
- `mockUsb` uses Approach B from PLAYWRIGHT.md: sets `window.__webusbFactory`
  before Vue mounts; `main.ts` picks it up in place of `new WebUsbFtdiFactory()`.
- `WebSerialFactory.isAvailable()` changed from `'serial' in navigator` to
  `!!navigator.serial`. The `in` operator returns true in Chromium even after
  `Object.defineProperty(navigator, 'serial', { value: undefined })`, so
  truthiness is required for the no-backend E2E test to work.
- `@hardware` extended tests are co-located in `connect.spec.ts` (mid-stream
  disconnect, immediate reconnect) and `terminal.spec.ts` (100 k bytes), not in
  a separate file.
- `e2e/fixtures.ts` exports `pairedPage` (in addition to `mockedPage`) for
  auto-reconnect tests.
- `docs/MANUAL-SMOKE.md` already existed from Phase 6 with comprehensive content;
  no changes needed.

### Commits (actual)

- `feat(e2e): add mockSerial and mockUsb helpers with push/poll interface`
- `feat(e2e): add Playwright fixtures with mockedPage and pairedPage`
- `feat(web-serial): add __webusbFactory escape hatch and fix isAvailable`
- `test(e2e): cover connect/disconnect flow for both backends`
- `test(e2e): cover all settings controls, persistence, and lock-while-connected`
- `test(e2e): cover xterm rendering, ANSI sequences, URL links, keyboard shortcuts`
- `test(e2e): cover local echo on/off behaviour`
- `test(e2e): cover backend selector availability, persistence, and locking`
- `test(e2e): cover auto-reconnect on mount and no-device-found path`

### Acceptance

- [x] All new Playwright tests pass: `npm run test:e2e` (41/41)
- [x] `@hardware` tests pass: `TERMINAL_HW_TEST=1 npm run test:hw` (included in 41)
- [ ] Manual smoke tests per `docs/MANUAL-SMOKE.md` pass on real hardware (both devices)
- [x] `npm test` passes — no regressions (105/105)
- [x] `npm run typecheck` and `npm run lint` clean
- [x] Branch merged

---

## Phase 8 — Polish, deployment, release

Branch: `phase/08-release`

(Previously numbered Phase 6; renumbered when Phases 6 and 7 were inserted.)

**Goal:** Ship v0.1.0. Verify the static build deploys to a plain
Apache or nginx server with no Node.js required.

### Tasks

1. **Verify the static build is portable.**
   - Run `npm run build`. Confirm `dist/` contains only `.html`, `.js`,
     `.css`, and asset files — nothing requiring a runtime.
   - Verify `<script>` and `<link>` tags in `dist/index.html` use
     relative paths (`./assets/...`), not absolute (`/assets/...`).
     This is what the `base: './'` Vite config from Phase 0 gives us.
   - Smoke test the built bundle: `npx serve dist/` (or any static
     server), open in Chromium over HTTPS or `localhost`, exercise
     both backends.

2. **Write `docs/DEPLOYMENT.md`** with:
   - How to build (`npm run build` → upload `dist/` contents)
   - Apache and nginx config snippets
   - HTTPS requirement (loud — both Web Serial and WebUSB require
     secure context; this *must* be HTTPS in production)
   - Subpath deployment notes (works at `/`, `/lab/`,
     `/courses/embedded-101/serial-terminal/`, etc., unchanged)
   - A copy-pasteable `rsync` command for the user's typical workflow

3. **Update README.md** with:
   - What the app does
   - Screenshot of both backends in use
   - Lab-setup quickstart (Zadig instructions for binding WinUSB to
     FTDI on Windows; udev rules on Linux)
   - Link to `docs/DEPLOYMENT.md` for the static-deploy procedure
   - Link to the `ftdi-webusb-driver` library repo
   - **Attribution** to zaxbux/web-serial-console as reference reading

4. **Add `docs/LAB-SETUP.md`** for instructors deploying this in a
   classroom (WinUSB binding, Chromium version requirements, the
   one-time WebUSB permission prompt, how to revoke permissions if a
   board changes hands).

5. **Add `CHANGELOG.md`** with the v0.1.0 changes.

6. **Add `LICENSE`** (MIT).

7. **Tag `v0.1.0`** and push.

8. **Deploy to the university server.**
   - Build locally on the dev VM
   - `rsync -avz --delete dist/ user@uni-server:/var/www/html/serial-terminal/`
     (or whatever the actual path is)
   - Verify the deployed URL serves over HTTPS and both backends work
     against a real FT231XS

### Notes on implementation

- `docs/DEPLOYMENT.md` was already present from earlier phases; no changes needed.
- `docs/LAB-SERVER-SETUP.md` (server provisioning) already existed; `docs/LAB-SETUP.md`
  (classroom/student setup) was added as a separate, complementary document.
- Server deployment (task 8.8) is pending: nginx is not yet configured and
  `/var/www/` does not exist on the lab VM. Manual step required before the
  app is reachable to students.
- Git push is pending SSH key configuration for the remote at
  `<git origin>`.

### Commits (actual)

- `chore(build): verify dist/ uses only relative paths`
- `docs(deploy): DEPLOYMENT.md already present from prior phases`
- `docs: write README with quick-start and lab setup link`
- `docs: add LAB-SETUP guide for classroom deployment`
- `docs: add CHANGELOG for v0.1.0`
- `chore: add LICENSE (MIT)`
- `chore: bump version to 0.1.0`
- `chore: tag v0.1.0`

### Acceptance

- [x] `dist/` is a self-contained static bundle (no Node, no runtime deps)
- [x] HTML uses relative asset paths so deployment subpath doesn't matter
- [ ] Smoke-tested on a real Apache or nginx behind HTTPS (pending deploy)
- [x] README is clear enough that a new student can set up the
      classroom workflow from scratch
- [ ] `v0.1.0` tag is pushed (pending git remote SSH key)
- [ ] App is deployed and reachable to students (pending nginx setup)

---

## Phase 9 — Terminal UX & theming (release v1.1.0)

Clear-terminal (button + configurable/off hotkey), font + colour-theme
selection, a non-modal settings drawer, modern token-driven control styling,
and durable/portable settings (localStorage + `persist()` + Export/Import).

Full plan and sub-phases (A–E, TDD): [`docs/phases/PHASE-09-ui-theming.md`](docs/phases/PHASE-09-ui-theming.md).

---

## Phase 10 — Toolbar & connection UX

A toolbar/connection refresh informed by the live zaxbux web-serial-console
(features only — we keep our plain-CSS, no-Vuetify/Pinia/router stack):
toolbar clicks return focus to the terminal; the connection control becomes
**"Serial connect:"** with a unified dropdown of paired devices (Web Serial +
WebUSB-FTDI) plus "Request…" actions; **baud** moves to a toolbar dropdown; a
**Serial Settings** dropdown holds the remaining port options; new **Download**
and **Fullscreen** buttons. Adds `@xterm/addon-serialize`.

Full plan and sub-phases (10A–10G, TDD):
[`docs/phases/PHASE-10-toolbar-connection-ux.md`](docs/phases/PHASE-10-toolbar-connection-ux.md).

---

## Phase 11 — Terminal behaviours & polish

The terminal-side half: verified **clickable URLs**; a **bell** with zaxbux's
options (`bell` on/off + `bellStyle` none/visual/sound/both); the worthwhile
xterm addons (`@xterm/addon-search` find, optional `@xterm/addon-unicode11`); and
a **splash** overlay in the terminal pane that promotes the project and clears on
the first typed or received byte.

Full plan and sub-phases (11A–11D, TDD):
[`docs/phases/PHASE-11-terminal-behaviors.md`](docs/phases/PHASE-11-terminal-behaviors.md).
