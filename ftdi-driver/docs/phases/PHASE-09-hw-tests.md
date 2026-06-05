# PHASE-09-hw-tests.md — Hardware-in-loop integration tests

Branch: `phase/09-hw-tests`

## Goal

A set of smoke tests that run against **real** FT231XS hardware. Skipped
in `npm test`; runnable via `npm run test:hw` with the gate
`FTDI_HW_TEST=1`. These are the final confidence check that all the
mock-driven code actually works on a chip.

## Hardware setup

Required:

1. An FT231XS-based board. The user's primary target is the **ULX3S
   board** with an ESP32 wired to the FTDI UART (the ESP32 echoes its
   boot log when reset).
2. A second FT231XS with TX/RX looped back externally (jumper wire from
   pin 1 to pin 5 on the FT231XS, or equivalent on the board). This
   gives a deterministic loopback path.
3. Driver state:
   - **Linux:** udev rule giving the test user permission to claim the
     device. Example `/etc/udev/rules.d/99-ftdi.rules`:
     ```
     SUBSYSTEM=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6015", MODE="0666"
     ```
   - **Windows:** WinUSB binding via Zadig.
   - **macOS:** Should work without special configuration; the FTDI
     kext can coexist with WebUSB claiming since Big Sur.

Tests run from Node, which means we need to mock `navigator.usb` because
WebUSB doesn't exist in Node. **But** we also need to talk to real
hardware. The clean solution: use the [`usb`](https://www.npmjs.com/package/usb)
npm package (libusb bindings for Node) and wrap it in a `UsbTransport`
implementation. This is **test-only code** that lives in
`test-hw/node-usb-transport.ts`. It's not exposed by the library.

```ts
// test-hw/node-usb-transport.ts
import { usb } from 'usb';  // or 'webusb' from the same package
import type { UsbTransport, ControlSetup } from '../src/transport.js';

export class NodeUsbTransport implements UsbTransport {
  // Implement against the libusb-based 'usb' package.
  // The npm 'usb' package since v2 ships a WebUSB-compatible adapter
  // at `usb.webusb`, which makes this near-trivial.
}
```

Alternative: use the `webusb` package's drop-in `navigator.usb` polyfill
for Node:

```ts
import { webusb } from 'usb';
const device = await webusb.requestDevice({ filters: [{ vendorId: 0x0403, productId: 0x6015 }] });
const ftdi = await FtdiUart.open(device);  // same API as in the browser
```

This second approach is preferred: the test exercises the **real**
public API path (including `WebUsbTransport`).

## TDD walkthrough

These tests are not classic TDD — they're integration smoke tests. They
**verify** behaviour rather than drive design. So we write them once,
and they either pass or expose a bug in the library.

### Step 9.1 — Setup file

`test-hw/setup.ts`:

```ts
import { webusb } from 'usb';
import type { USBDevice } from 'usb';

let cachedDevice: USBDevice | undefined;

export async function getTestDevice(): Promise<USBDevice> {
  if (!process.env.FTDI_HW_TEST) {
    throw new Error('Hardware tests skipped: FTDI_HW_TEST not set');
  }
  if (cachedDevice) return cachedDevice;

  const devices = await webusb.getDevices();
  const ftdi = devices.find(
    (d) => d.vendorId === 0x0403 && d.productId === 0x6015,
  );
  if (!ftdi) {
    throw new Error(
      'No FT231XS (0403:6015) found. Plug the board in and try again.',
    );
  }
  cachedDevice = ftdi;
  return ftdi;
}
```

**Commit:** `test(hw): add hardware test setup helper`

### Step 9.2 — Loopback PING test

`test-hw/loopback.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

describe('loopback (TX/RX shorted)', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
    await ftdi.configure({ baud: 115200, latencyMs: 4 });
  });

  afterAll(async () => {
    await ftdi.close();
  });

  it('echoes a written PING back via loopback', async () => {
    const ping = new TextEncoder().encode('PING\n');
    await ftdi.write(ping);

    // Drain until we've collected at least the length we sent.
    const collected: number[] = [];
    const deadline = Date.now() + 2000;
    while (collected.length < ping.length && Date.now() < deadline) {
      const chunk = await ftdi.read();
      collected.push(...chunk);
    }

    expect(new TextDecoder().decode(new Uint8Array(collected))).toContain('PING');
  });
});
```

**Commit:** `test(hw): add loopback PING/echo test`

### Step 9.3 — Baud rate cycle

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

describe('baud cycling', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
  });

  afterAll(async () => {
    await ftdi.close();
  });

  for (const baud of [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]) {
    it(`reconfigures to ${baud} baud without error`, async () => {
      await expect(ftdi.configure({ baud })).resolves.not.toThrow();
    });
  }
});
```

**Commit:** `test(hw): add baud-cycle reconfiguration test`

### Step 9.4 — Stream lifecycle test

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

describe('streams over real hardware', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
    await ftdi.configure({ baud: 115200, latencyMs: 4 });
  });

  afterAll(async () => {
    await ftdi.close();
  });

  it('pipes data through readable/writable with loopback', async () => {
    const writer = ftdi.writable.getWriter();
    const reader = ftdi.readable.getReader();

    await writer.write(new TextEncoder().encode('HELLO'));
    writer.releaseLock();

    const collected: number[] = [];
    const deadline = Date.now() + 2000;
    while (collected.length < 5 && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) collected.push(...value);
    }
    reader.releaseLock();

    expect(new TextDecoder().decode(new Uint8Array(collected))).toBe('HELLO');
  });
});
```

**Commit:** `test(hw): add stream lifecycle loopback test`

### Step 9.5 — Document the procedure

Add `test-hw/README.md`:

```markdown
# Hardware-in-loop tests

These tests run against a real FT231XS chip. They are excluded from
`npm test`. To run them:

1. Plug in an FT231XS-based board (e.g. ULX3S).
2. (Linux) Ensure your user can claim the device. See
   `docs/phases/PHASE-09-hw-tests.md` for the udev rule.
3. (Windows) Bind the device to WinUSB with Zadig.
4. (For loopback tests) Short the TX and RX pins on the FT231XS.
5. Run:

       FTDI_HW_TEST=1 npm run test:hw

If the device isn't found, the suite skips with a clear error. If the
device is found but tests fail, check:

- Is another process holding the device? (Kill any open serial terminals.)
- Is the right driver bound? (`lsusb -v` on Linux, Zadig on Windows.)
- Is the loopback jumper in place?
```

**Commit:** `docs(hw): document hardware test setup procedure`

## Acceptance checklist

- [ ] `npm run test:hw` exits 0 with the board plugged in and looped back
- [ ] `npm run test:hw` exits non-zero (with clear error) when the board
      is absent
- [ ] `test-hw/README.md` documents the setup
- [ ] Branch merged to `main`

## Optional follow-ups (not part of this phase)

- A `bench/` directory with throughput measurements at various baud rates
  and latency-timer settings.
- A CI workflow that runs the unit tests on every push, with manual
  triggering of HW tests on a self-hosted runner with a board attached.
