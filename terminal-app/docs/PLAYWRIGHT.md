# PLAYWRIGHT.md — E2E test patterns

What Playwright covers in this project, and concrete patterns for mocking
the WebUSB and Web Serial browser APIs.

## Test layers

This project has three layers of tests at different fidelity / speed
trade-offs:

| Layer | Runner | Where it runs | What it covers |
|-------|--------|---------------|----------------|
| Unit  | Vitest (node env) | CI + local | Pure logic: settings persistence, backend factories with mocked globals, option translation |
| Component | Vitest (jsdom env) | CI + local | Vue components in isolation (Terminal, BackendSelector, SettingsPanel) |
| E2E   | Playwright (headless Chromium) | CI + local | The whole app, navigated as a user would, with browser APIs mocked |

Playwright tests live in `e2e/*.spec.ts`. Unit and component tests
live in `src/**/*.test.ts`.

## What Playwright mocks vs. runs real

| API / dependency | E2E approach | Why |
|-----------------|--------------|-----|
| `navigator.serial` | Mocked via `addInitScript` | The picker is browser-chrome; can't be driven from page context |
| `navigator.usb`    | Mocked via `addInitScript` | Same reason |
| `localStorage`     | Real | Playwright has a clean origin per test, so each test starts empty |
| `xterm.js`         | Real | Renders into a real DOM; tests assert on output |
| `ftdi-webusb-driver` library | Real, but with mocked `USBDevice` | Library's own tests cover protocol; here we only verify wiring |
| Real FT231XS hardware | Out of scope for E2E | Manual smoke tests at end of each phase |

## The injection pattern

Playwright's `page.addInitScript()` runs JS before any page script.
Use it to install fakes for `navigator.serial` and `navigator.usb`
before the Vue app boots and checks `isAvailable()`.

```ts
// e2e/helpers/mockSerial.ts

export interface SerialPortMock {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

/**
 * Installs a fake navigator.serial that yields a single mock port.
 * Test code can push bytes through `pushFromDevice()` and read
 * what the app wrote via `getDeviceWrites()`.
 */
export async function installMockSerial(page: Page) {
  await page.addInitScript(() => {
    // This script runs in the page context — separate from the test's
    // Node.js context. Hence the IIFE and the window globals for
    // test-side access.

    const incomingChunks: Uint8Array[] = [];
    const writtenChunks: Uint8Array[] = [];
    let incomingController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const readable = new ReadableStream<Uint8Array>({
      start(c) { incomingController = c; },
    });

    const writable = new WritableStream<Uint8Array>({
      write(chunk) { writtenChunks.push(chunk); },
    });

    const port = {
      open: async (_options: unknown) => {},
      close: async () => {},
      readable,
      writable,
    };

    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        requestPort: async () => port,
        getPorts: async () => [port],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });

    // Expose helpers on window for the test to drive
    (window as any).__pushFromDevice = (bytes: number[]) => {
      incomingController?.enqueue(new Uint8Array(bytes));
    };
    (window as any).__getDeviceWrites = () => {
      return writtenChunks.map(c => Array.from(c));
    };
  });
}
```

The test then drives the mock via `page.evaluate()`:

```ts
import { test, expect } from '@playwright/test';
import { installMockSerial } from './helpers/mockSerial';

test('Web Serial connect → bytes appear in terminal', async ({ page }) => {
  await installMockSerial(page);
  await page.goto('http://localhost:5173/');

  // Pick the Web Serial backend and click Connect
  await page.getByRole('combobox', { name: /backend/i }).selectOption('web-serial');
  await page.getByRole('button', { name: /connect/i }).click();

  // Simulate the device sending "HELLO\r\n"
  await page.evaluate(() => {
    (window as any).__pushFromDevice([72, 69, 76, 76, 79, 13, 10]);
  });

  // Assert it shows up in the xterm DOM. xterm renders to a canvas
  // by default; for testability, configure it with the DOM renderer
  // in test builds (or use xterm's screen-reader buffer).
  await expect(page.locator('.xterm-rows')).toContainText('HELLO');
});
```

## Mocking navigator.usb (the FTDI backend)

`navigator.usb` is trickier because the FTDI backend goes through the
full `FtdiUart` setup sequence — `controlTransferOut` × N, then
`transferIn`/`transferOut` loops. Mocking each control transfer
inline is verbose.

**Two approaches:**

### Approach A: deep mock of USBDevice

Mirror the same pattern as `mockSerial.ts`, but provide a fake
`USBDevice` that records every `controlTransferOut` call and returns
canned responses for `controlTransferIn`. Heavy but fully realistic.

### Approach B: shallow mock — replace the factory itself

In the app's composition root, the WebUSB factory is registered via
`provide`. Add a test-only escape hatch:

```ts
// src/main.ts
if ((window as any).__testBackendFactory) {
  app.provide('webusbFactory', (window as any).__testBackendFactory);
}
```

Then in `addInitScript`:

```ts
(window as any).__testBackendFactory = {
  id: 'webusb-ftdi',
  displayName: 'WebUSB (FTDI)',
  isAvailable: () => true,
  pickDevice: async () => makeFakeBackend(),
  listPaired: async () => [],
};
```

**Recommendation: Approach B for E2E.** The library repo's tests already
cover the deep protocol path; here we only need to prove the app wires
the abstraction correctly. Keep E2E tests focused on UI behaviour, not
on re-testing the library.

## Reusable test fixture

For tests that share setup, use Playwright's fixture system:

```ts
// e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { installMockSerial } from './helpers/mockSerial';
import { installMockUsb } from './helpers/mockUsb';

export const test = base.extend<{
  mockedPage: typeof base.expect.extending; // page with both mocks installed
}>({
  mockedPage: async ({ page }, use) => {
    await installMockSerial(page);
    await installMockUsb(page);
    await page.goto('/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

Then in tests:

```ts
import { test, expect } from './fixtures';

test('backend selector defaults to Web Serial', async ({ mockedPage }) => {
  const selector = mockedPage.getByRole('combobox', { name: /backend/i });
  await expect(selector).toHaveValue('web-serial');
});
```

## Playwright config

Minimal `playwright.config.ts` for this project:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

`webServer` makes Playwright auto-start Vite's dev server before running
tests, so `npx playwright test` is one command.

## Playwright on the Raspberry Pi 5 (arm64, Debian 13)

The lab machine running Claude Code is a headless Raspberry Pi 5.
These are the quirks discovered by running Playwright 1.60 on it —
each one verified empirically.

### 1. arm64 binary — download works, plan for ~1 GB

Playwright 1.30+ ships official arm64 Chromium builds.
`npx playwright install chromium` downloads ~300 MB and unpacks to
`~/.cache/ms-playwright/` (two binaries: headless shell + full chrome,
plus FFmpeg ≈ 956 MB total). The Pi5's NVMe / SD card must have that
free. After install, the binary runs without extra config.

### 2. `webServer` command must go through npm

`vite` is not on the system PATH — only in `node_modules/.bin/`.
If you write `command: 'vite'` in `playwright.config.ts`, Playwright
will download a fresh copy of the latest Vite, not use the project's
pinned version. Use `npm run dev` instead:

```ts
webServer: {
  command: 'npm run dev',   // correct — npm extends PATH to node_modules/.bin
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
},
```

`node_modules/.bin/vite` also works as a literal path if you prefer
to be explicit, but `npm run dev` is idiomatic and picks up any dev
script changes automatically.

### 3. WebUSB / Web Serial need `localhost`, not `about:blank`

`navigator.usb` and `navigator.serial` are both `undefined` on
`about:blank` because it is not a secure context. On
`http://localhost:5173/` Chromium treats localhost as a secure origin
and both APIs are present. Always navigate to the dev server — never
to `about:blank` — before interacting with serial/USB mocks:

```ts
// Wrong — navigator.usb will be undefined
await page.goto('about:blank');

// Right
await page.goto('/');  // resolves to baseURL http://localhost:5173
```

This is why the `baseURL` + `webServer` pairing is non-negotiable
on Pi5: without a real localhost origin, the entire mock layer silently
breaks.

### 4. Playwright uses `headless_shell`, not the full Chrome

The launched binary is
`~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell`,
a stripped build without a UI layer. WebUSB and Web Serial ARE present
in headless_shell on localhost, but `requestDevice()` / `requestPort()`
cannot pop a device picker in headless mode — they return a
`NotFoundError` instead of waiting for user selection.

**Consequence:** real hardware selection cannot be automated from
Playwright tests. Use `addInitScript` mocks (see above) for everything
that touches serial/USB. Reserve real-hardware interaction for manual
smoke tests.

### 5. `--no-sandbox` is already set — no action needed

Playwright passes `--no-sandbox` automatically on Linux. The
`chrome_sandbox` binary in the downloaded bundle is not setuid root
(it's owned by the local user), but that doesn't matter because
Playwright bypasses the setuid sandbox. No `--no-sandbox` flag in
`launchOptions` is required.

### 6. VA-API warning — harmless noise

Every Chromium launch emits:

```
ERROR:media/gpu/vaapi/vaapi_wrapper.cc: vaInitialize failed: unknown libva error
WARNING:sandbox/policy/linux/sandbox_linux.cc: InitializeSandbox() called with multiple threads in process gpu-process.
```

These are GPU-layer warnings. Chromium falls back to SwiftShader
(software rendering), which works fine for Playwright tests. Ignore
them; tests pass normally.

### 7. CDP `DeviceAccess` — works but prompt never fires in headless_shell

You can `DeviceAccess.enable` via a CDP session and register for
`DeviceAccess.deviceRequestPrompted`, but the event never arrives in
headless_shell because USB enumeration requires the UI subprocess.
This means the CDP-based "auto-select real device" pattern does not
work here. Stick to mocks.

### 8. System Chromium as a fallback

`/usr/bin/chromium` (Raspberry Pi's arm64 build, same major version as
Playwright's bundle) can be used as `executablePath`:

```ts
use: {
  launchOptions: {
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox'],
  },
},
```

This avoids the 1 GB cache download if disk space is tight. The
trade-off is that Playwright's CDP assumptions are calibrated to its
bundled binary; subtle version drift can cause unexpected test
failures. Prefer the bundled binary for CI.

### 9. udev rules for raw USB access (real-hardware smoke tests)

When running manual browser smoke tests against real hardware, Chromium
needs read/write access to the USB device node (`/dev/bus/usb/…`).
The user running Chromium must be in the `plugdev` group, and a udev
rule must grant `plugdev` ownership:

```udev
# /etc/udev/rules.d/99-ftdi-webusb.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6015", \
  MODE="0660", GROUP="plugdev", TAG+="uaccess"
```

On this Pi5 the kernel's default USB udev rules already add `TAG+=uaccess`
for the FTDI device, which grants access to the logged-in session user.
The Pico (2e8a:000a) and Kiwi (cafe:400f) DUT devices have explicit
rules in `/etc/udev/rules.d/99-pico-usb.rules`. New Pi5 setups need
these rules before manual WebUSB smoke tests will work.

### Summary of Pi5 one-time setup

```bash
# 1. Install Playwright browser (≈300 MB download, ≈956 MB on disk)
npx playwright install chromium

# 2. Install OS-level deps (idempotent — already satisfied on this Pi5)
npx playwright install-deps chromium

# 3. Verify
npx playwright test          # all tests green, VA-API warning is fine
```

No display server, no `--no-sandbox` flag, no special kernel tuning
required. The setup above is all that's needed.

If a test fails and you want to step through it visually, run with
`--headed --ui` from a workstation with a display (VS Code
Remote-SSH + X forwarding or a VNC session):

```bash
# From a workstation with display forwarding:
npx playwright test --ui
```

## Playwright MCP on Windows (real hardware, Claude-driven)

The Pi5 section above covers automated CI-style tests with mocked
APIs. This section covers a different workflow: using the Playwright
MCP server to let Claude Code drive a **real browser on your Windows
laptop** against the deployed app, with real USB devices connected.

### How it works

The Playwright MCP server runs on the **same machine as Claude Code**.
To reach a browser that has access to your laptop's USB ports, Claude
Code itself must run on your laptop — either the Claude Code desktop
app or the CLI. The lab server's Claude Code instance cannot reach a
browser on a different machine.

```
Your Windows laptop
├── Claude Code (desktop app or CLI)
├── @playwright/mcp server  ← Claude talks to this
└── Chromium (launched by MCP server)
    └── https://<deploy-host>
        └── WebUSB / Web Serial → USB device
```

### Setup (one-time, on your Windows laptop)

The commands below work identically in **PowerShell** and **CMD**.

```text
:: 1. Install the MCP server (bundles its own Playwright) plus the
::    Playwright CLI, so a real `playwright` command lands on PATH.
npm install -g @playwright/mcp playwright

:: 2. Download the Chromium build Playwright will drive.
playwright install chromium

:: 3. Register the server in Claude Code (see Windows note below).
claude mcp add playwright -- cmd /c npx @playwright/mcp
```

**Why `playwright install` and not `npx playwright install`?** On a
fresh machine there is no local `playwright` package, so `npx
playwright …` fails with `'playwright' is not recognized`. Installing
`playwright` globally in step 1 puts a real shim on PATH that runs the
same way in PowerShell and CMD — no `npx`, no PowerShell `&` call
operator, no digging into `node_modules\.bin\playwright.cmd`.

If you prefer not to install the CLI globally, run the copy bundled
inside the MCP server instead. In PowerShell this needs the `&` call
operator and the `.cmd` extension:

```powershell
& "$(npm root -g)\@playwright\mcp\node_modules\.bin\playwright.cmd" install chromium
```

Also use this bundled form if the MCP server ever reports a missing or
incompatible browser: it guarantees you download the exact Chromium
revision that server's Playwright expects (the global `playwright` may
be a newer release that pulls a different revision).

**Windows note on step 3.** Claude Code spawns the MCP command without
a shell, and a bare `npx` is really `npx.cmd`, which Windows cannot
spawn directly — you get a `spawn npx ENOENT` failure. Wrap it in
`cmd /c`:

```text
claude mcp add playwright -- cmd /c npx @playwright/mcp
```

On macOS / Linux the `cmd /c` prefix is unnecessary:

```bash
claude mcp add playwright -- npx @playwright/mcp
```

**Do not pass `--headed`.** As of `@playwright/mcp` 0.0.75 a *visible*
browser is the default, and `--headed` is no longer a valid option —
passing it makes the server exit immediately with
`error: unknown option '--headed'`, which shows up in Claude Code as
`✗ Failed to connect`. A visible window is exactly what hardware
testing needs: you watch every action Claude takes and grant the device
picker yourself. Pass `--headless` only if you ever want to opt out of
the visible window.

After registering, verify the server actually launches — `add` only
writes config, it does not start anything:

```text
claude mcp list
```

The `playwright` entry should read `✓ Connected`. If it shows
`✗ Failed to connect`, run the configured command by hand
(`cmd /c npx @playwright/mcp`) to see the real error; a server that
starts correctly will sit silently waiting on stdin (Ctrl+C to exit).

### The permission boundary — what you must do yourself

Web Serial and WebUSB enforce that the device picker can only open in
response to a real user gesture. Even in a Playwright-controlled
session, Chromium will show the OS-level picker dialog and wait for a
human click. Claude cannot select a device programmatically.

Workflow:

1. Claude navigates to the app, selects the backend, configures
   settings, and clicks Connect.
2. **You click Allow / select the device** in the picker dialog.
3. Claude observes the terminal, asserts on output, types commands,
   etc.

This is the natural break point: Claude sets up and observes; you own
the hardware grant.

### Risk profile

| Concern | Mitigation |
|---------|------------|
| Claude accesses saved browser passwords / sessions | MCP server launches a **fresh isolated Chromium profile**, not your regular Chrome |
| Claude takes unexpected browser actions | The MCP server runs headed by default (don't pass `--headless`); you see every action in real time and can close the window |
| Claude sends unexpected bytes to hardware | Real serial/USB commands go through your port grant — only possible after you approved the picker. Add "observe only, don't type into the terminal" to your prompt if you want to be explicit |
| MCP server accesses your filesystem | `@playwright/mcp` only exposes browser control tools — no shell, no file reads |

### Tagging real-hardware tests

The playwright config already excludes tests tagged `@hardware` unless
`TERMINAL_HW_TEST=1` is set:

```ts
// playwright.config.ts
...(!HW_TEST && { grep: /^(?!.*@hardware)/ })
```

Write hardware-dependent tests with the tag in the test name:

```ts
test('@hardware Web Serial — bytes from FT231XS appear in terminal', async ({ page }) => {
  await page.goto('https://<deploy-host>/')
  // Claude clicks Connect, you grant the picker, Claude observes
  await page.getByRole('button', { name: /connect/i }).click()
  // ↑ triggers the picker — you must click the device in the dialog
  await expect(page.locator('.xterm-rows')).toContainText('>', { timeout: 10_000 })
})
```

Run hardware tests from the Claude Code session on your laptop:

```powershell
$env:TERMINAL_HW_TEST=1; npx playwright test --headed
```

Or ask Claude Code (running on your laptop) to run them via the
Playwright MCP server — it will drive the browser and pause for your
input at the device picker. For a curated, step-by-step version of that
Claude-driven protocol, see [SEMIAUTO-SMOKE.md](./SEMIAUTO-SMOKE.md).

### Driving a real run via MCP — verified patterns

These are lessons from actually running the MCP-driven flow against the
deployed app with both lab loopback rigs (a Pico CDC on Web Serial and an
FT231x on WebUSB). They are the difference between a smooth run and ten
minutes of confusion. All verified empirically.

**The HIL rigs are loopbacks — use the echo count as your assertion.**
Both lab devices reflect every byte they receive, so you don't need the
device to volunteer any output. Type a distinctive marker and count how
many times each character lands in the terminal:

- **Echo checkbox OFF** → each char appears **once** (hardware loopback only).
- **Echo checkbox ON** → each char appears **twice** (app local echo + loopback).

So `PING` with echo off renders `PING`; typing `ZQ` with echo on renders
`ZZQQ`. A *single* char with echo off that shows up *doubled* would mean
the app is wrongly local-echoing; a char that never appears means the
write or read path is broken. This makes a one-character keystroke a
complete round-trip TX→RX assertion.

**Read the echoed bytes straight from the DOM — don't screenshot.**
xterm renders to `.xterm-rows`; each child is one row. Pull the text with
an `evaluate`:

```js
() => Array.from(document.querySelector('.xterm-rows').children)
  .map(r => r.textContent).filter(s => s && s.trim().length)
```

This is exact and assertable. (MCP `browser_take_screenshot` also writes
to the *MCP server's* output directory, not your repo's working dir, so
the file won't be where you expect — another reason to prefer the DOM read.)

**You cannot `fill()` the xterm input — send real keystrokes.** xterm's
input sink is an intentionally off-screen `.xterm-helper-textarea`.
Playwright considers it "not visible", so `browser_type` / `fill()` time
out against it. Click the `.xterm-screen` to focus, then drive
`browser_press_key` (Playwright `page.keyboard.press`) one key at a time.
That dispatches genuine keyboard events, which is also closer to what a
real user does.

**Auto-reconnect usually swallows the device picker.** The app
auto-reconnects on mount — Web Serial via `getPorts()`, WebUSB via its
paired-device list — so once a device has been granted in this browser
profile, **Connect goes straight to the connected state and no picker
fires.** The "pause for your input at the device picker" step only
actually happens on the *first* pairing in a fresh profile (the MCP
server launches a clean profile each session, but pairings granted
earlier in the same session persist). Don't wait forever for a picker
that isn't coming — snapshot the page and check whether the button
already flipped to **Disconnect**.

**The terminal buffer carries across a backend switch.** Disconnecting
Web Serial and connecting WebUSB does *not* clear the xterm scrollback —
text from the previous backend is still on screen. Account for it: when
you type a new marker, assert on the *newly appended* tail, not on the
whole buffer being equal to your marker.

**A transient `Target page closed` on the very first action is benign.**
Occasionally the first `navigate`/`Connect` returns
`Target page closed` and the page drops to `about:blank` — an MCP/browser
handshake hiccup, not an app fault. Re-navigate to the app URL and
continue; it does not recur.

### Connecting to the deployed app vs. the dev server

The deployed app at `https://<deploy-host>/`
is a valid secure context (HTTPS), so Web Serial and WebUSB are
available. You do not need to run the dev server locally on your
laptop for hardware tests.

The Pi5 `localhost` requirement only applies when running tests against
the dev server in a headless environment; it does not apply here.

## What we don't test with Playwright

- **Real WebUSB device communication in CI.** The library's `test-hw/`
  suite covers this from Node-side via the library's `MockUsbTransport`.
  Real-hardware browser testing uses the Playwright MCP approach
  described above — Claude drives the browser, you grant the device
  picker, Claude observes. This is not CI-runnable (no physical device),
  but it is Claude-assisted rather than purely manual.
- **Cross-browser behaviour.** WebUSB and Web Serial are Chromium-only
  in 2026. No point running these tests in Firefox or WebKit; they'd
  all fail at the availability check.
- **Permissions revocation flow.** Chromium handles this through
  browser settings, not the page; out of scope for E2E.

## Tests to write per phase

(Cross-reference `PLAN.md` for the bigger picture.)

| Phase | E2E tests |
|-------|-----------|
| 0 | App loads; terminal pane renders; Connect button disabled |
| 2 | Web Serial connect → device-write bytes show in terminal; keystroke → device receives |
| 3 | WebUSB connect (via mocked factory) → bytes flow both ways |
| 4 | Backend selector lists only available backends; switching is locked while connected |
| 5 | Settings round-trip across reload; auto-reconnect on mount with paired device |
| 6 | Smoke test after deploy: navigate to deployed URL, see backend options (mock not needed here — Chromium is real) |
