# PHASE-06-ftdi-uart-setup.md — FtdiUart class: open, configure, close

Branch: `phase/06-ftdi-uart-setup`

## Goal

Implement the main `FtdiUart` class. By the end of this phase, a caller
can do:

```ts
const transport = new WebUsbTransport(usbDevice);
const ftdi = new FtdiUart(transport);
await ftdi.open();
await ftdi.configure({ baud: 115200, dataBits: 8, parity: 'none', stopBits: 1 });
// ... read/write come in Phase 7
await ftdi.close();
```

This phase is the first one that **composes** the pure-function building
blocks from Phases 1-4 with the `UsbTransport` from Phase 5. The
implementation is mostly orchestration.

## API

```ts
// src/ftdi-uart.ts

export interface SerialOptions {
  baud: number;
  dataBits?: DataBits;       // default 8
  parity?: Parity;            // default 'none'
  stopBits?: StopBits;        // default 1
  flowControl?: FlowMode;     // default 'none'
  dtr?: boolean;              // default true (assert)
  rts?: boolean;              // default true (assert)
  latencyMs?: number;         // default 16
}

export interface FtdiUartOptions {
  interfaceNumber?: number;   // default 0
  bulkInEndpoint?: number;    // default 1 (the FT231XS IN endpoint number)
  bulkOutEndpoint?: number;   // default 2 (the FT231XS OUT endpoint number)
}

export class FtdiUart {
  constructor(
    private readonly transport: UsbTransport,
    options?: FtdiUartOptions,
  );

  static async open(device: USBDevice, options?: FtdiUartOptions): Promise<FtdiUart>;

  async open(): Promise<void>;
  async configure(opts: SerialOptions): Promise<void>;
  async close(): Promise<void>;

  readonly bulkInEndpoint: number;
  readonly bulkOutEndpoint: number;
  readonly interfaceNumber: number;
  readonly maxPacketSize: number;  // 64 for FT231XS
}
```

## Vendor request constants

```ts
// src/ftdi-protocol.ts

export const VendorRequest = {
  RESET:               0x00,
  MODEM_CTRL:          0x01,
  SET_FLOW_CTRL:       0x02,
  SET_BAUD_RATE:       0x03,
  SET_DATA:            0x04,
  GET_MODEM_STATUS:    0x05,
  SET_EVENT_CHAR:      0x06,
  SET_ERROR_CHAR:      0x07,
  SET_LATENCY_TIMER:   0x09,
  GET_LATENCY_TIMER:   0x0A,
  SET_BITMODE:         0x0B,
  READ_PINS:           0x0C,
} as const;

export const ResetSubcommand = {
  RESET_SIO:    0x0000,
  PURGE_RX:     0x0001,
  PURGE_TX:     0x0002,
} as const;
```

## TDD walkthrough

The big test here is "configure issues the right sequence of calls in the
right order with the right parameters". One big assertion captures it.

### Step 6.1 — Open and close lifecycle

```ts
import { describe, it, expect } from 'vitest';
import { FtdiUart } from './ftdi-uart.js';
import { MockUsbTransport } from './transport.mock.js';

describe('FtdiUart.open', () => {
  it('opens transport, selects config 1, claims interface 0', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    expect(mock.isOpen).toBe(true);
    expect(mock.selectedConfig).toBe(1);
    expect(mock.claimedInterfaces).toEqual([0]);
  });
});

describe('FtdiUart.close', () => {
  it('releases interface and closes transport', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    await ftdi.close();

    expect(mock.releasedInterfaces).toEqual([0]);
    expect(mock.isOpen).toBe(false);
  });
});
```

Red → commit: `test(setup): assert open/close lifecycle delegates correctly`

Implement:

```ts
export class FtdiUart {
  readonly interfaceNumber: number;
  readonly bulkInEndpoint: number;
  readonly bulkOutEndpoint: number;
  readonly maxPacketSize = 64;

  constructor(
    private readonly transport: UsbTransport,
    opts?: FtdiUartOptions,
  ) {
    this.interfaceNumber = opts?.interfaceNumber ?? 0;
    this.bulkInEndpoint = opts?.bulkInEndpoint ?? 1;
    this.bulkOutEndpoint = opts?.bulkOutEndpoint ?? 2;
  }

  async open(): Promise<void> {
    await this.transport.open();
    await this.transport.selectConfiguration(1);
    await this.transport.claimInterface(this.interfaceNumber);
  }

  async close(): Promise<void> {
    await this.transport.releaseInterface(this.interfaceNumber);
    await this.transport.close();
  }
}
```

Green → commit: `feat(setup): implement FtdiUart.open and close`

### Step 6.2 — Configure issues correct sequence

This is the central test. We assert the **exact** ordered list of
control-out calls.

```ts
describe('FtdiUart.configure', () => {
  it('issues the verified setup sequence for 115200 8N1', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.controlOutCalls.length = 0; // clear open() noise
    mock.enqueueControlInResponse(new Uint8Array([0x01, 0x60])); // GET_MODEM_STATUS reply

    await ftdi.configure({ baud: 115200 });

    expect(mock.controlOutCalls.map(c => c.setup)).toEqual([
      // 1. Reset
      { request: 0x00, value: 0x0000, index: 0x0000 },
      // 2. Set data (8N1)
      { request: 0x04, value: 0x0008, index: 0x0000 },
      // 3. Set DTR high
      { request: 0x01, value: 0x0101, index: 0x0000 },
      // 4. Set RTS high
      { request: 0x01, value: 0x0202, index: 0x0000 },
      // 5. Set flow control (none)
      { request: 0x02, value: 0x0000, index: 0x0000 },
      // 6. Set baud rate (115200 → wValue=0x001A, wIndex=0x0000)
      { request: 0x03, value: 0x001A, index: 0x0000 },
      // 7. Set latency timer (16 ms default)
      { request: 0x09, value: 0x0010, index: 0x0000 },
    ]);

    expect(mock.controlInCalls).toHaveLength(1);
    expect(mock.controlInCalls[0]!.setup).toEqual({
      request: 0x05, value: 0x0000, index: 0x0000,
    });
  });
});
```

Red → commit: `test(setup): assert configure issues full verified sequence`

Implement:

```ts
async configure(opts: SerialOptions): Promise<void> {
  const dataBits = opts.dataBits ?? 8;
  const parity = opts.parity ?? 'none';
  const stopBits = opts.stopBits ?? 1;
  const flowControl = opts.flowControl ?? 'none';
  const dtr = opts.dtr ?? true;
  const rts = opts.rts ?? true;
  const latencyMs = opts.latencyMs ?? 16;

  // 1. Reset
  await this.transport.controlOut({
    request: VendorRequest.RESET,
    value: ResetSubcommand.RESET_SIO,
    index: this.interfaceNumber,
  });

  // 2. Set data format
  await this.transport.controlOut({
    request: VendorRequest.SET_DATA,
    value: encodeLineProperties({ dataBits, parity, stopBits }),
    index: this.interfaceNumber,
  });

  // 3. Set DTR
  await this.transport.controlOut({
    request: VendorRequest.MODEM_CTRL,
    value: encodeModemControl({ dtr }).wValue,
    index: this.interfaceNumber,
  });

  // 4. Set RTS
  await this.transport.controlOut({
    request: VendorRequest.MODEM_CTRL,
    value: encodeModemControl({ rts }).wValue,
    index: this.interfaceNumber,
  });

  // 5. Set flow control
  const flowEncoded = encodeFlowControl(flowControl);
  await this.transport.controlOut({
    request: VendorRequest.SET_FLOW_CTRL,
    value: flowEncoded.wValue,
    index: flowEncoded.wIndex | this.interfaceNumber,
  });

  // 6. Set baud rate
  const baud = baudToDivisor(opts.baud);
  await this.transport.controlOut({
    request: VendorRequest.SET_BAUD_RATE,
    value: baud.wValue,
    index: baud.wIndex | this.interfaceNumber,
  });

  // 7. Set latency timer
  await this.transport.controlOut({
    request: VendorRequest.SET_LATENCY_TIMER,
    value: latencyMs & 0xFF,
    index: this.interfaceNumber,
  });

  // 8. Sanity-check modem status
  await this.transport.controlIn({
    request: VendorRequest.GET_MODEM_STATUS,
    value: 0,
    index: this.interfaceNumber,
  }, 2);
}
```

Green → commit: `feat(setup): implement configure() with verified sequence`

### Step 6.3 — Static factory

```ts
describe('FtdiUart.open(static)', () => {
  it('builds WebUsbTransport from USBDevice and opens', async () => {
    // This test is awkward because it needs a USBDevice double.
    // Build a minimal one:
    const calls: string[] = [];
    const fakeDevice = {
      open: async () => { calls.push('open'); },
      selectConfiguration: async () => { calls.push('select'); },
      claimInterface: async () => { calls.push('claim'); },
    } as unknown as USBDevice;

    const ftdi = await FtdiUart.open(fakeDevice);
    expect(calls).toEqual(['open', 'select', 'claim']);
    expect(ftdi).toBeInstanceOf(FtdiUart);
  });
});
```

Implement:

```ts
static async open(device: USBDevice, opts?: FtdiUartOptions): Promise<FtdiUart> {
  const transport = new WebUsbTransport(device);
  const ftdi = new FtdiUart(transport, opts);
  await ftdi.open();
  return ftdi;
}
```

Commit pair: test then feat.

### Step 6.4 — Edge case: 7E1

Since the user's USB capture actually showed 7E1, add an explicit test:

```ts
  it('encodes 7E1 line properties as 0x0207', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.controlOutCalls.length = 0;
    mock.enqueueControlInResponse(new Uint8Array([0x01, 0x60]));

    await ftdi.configure({ baud: 9600, dataBits: 7, parity: 'even', stopBits: 1 });

    const setDataCall = mock.controlOutCalls.find(c => c.setup.request === 0x04);
    expect(setDataCall!.setup.value).toBe(0x0207);
  });
```

This will pass straight away because `encodeLineProperties` already handles
it (Phase 2). Commit as regression coverage:
`test(setup): cover 7E1 line property encoding through configure path`

## Acceptance checklist

- [ ] All sequence-order tests pass
- [ ] open/close lifecycle correct
- [ ] Static factory builds WebUsbTransport correctly
- [ ] 7E1 regression test passes
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean
- [ ] Branch merged
