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

## Headless on the Debian 13 VM

The Debian 13 VM dedicated to Claude Code is headless. Playwright runs
Chromium headless by default, so this works without an X server. The
`webServer` block above ensures Vite is up before tests run.

If a test fails and you want to debug, run with `--headed --ui` from a
machine with a display — Playwright's UI mode lets you step through
tests visually.

```bash
# From a workstation with a display:
npx playwright test --ui

# On the headless VM, just:
npx playwright test
```

## What we don't test with Playwright

- **Real WebUSB device communication.** The library's `test-hw/` suite
  covers this from Node-side via the library's `MockUsbTransport`.
  Real-hardware browser testing is manual: open the deployed app in
  Chromium, click Connect, plug in the FT231XS, verify byte flow.
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
