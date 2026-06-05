# PHASE-05-usb-mock.md — UsbTransport interface and mock

Branch: `phase/05-usb-mock`

## Goal

Define a minimal `UsbTransport` interface that abstracts the WebUSB calls
the driver needs. Build:

- `MockUsbTransport` — records calls, returns pre-programmed responses,
  used in all subsequent driver tests.
- `WebUsbTransport` — thin wrapper around a real `USBDevice`.

This is a **structural** phase: we're not changing observable behaviour
yet, just preparing the seam at which all later tests will inject the mock.

## Interface

```ts
// src/transport.ts

export interface ControlSetup {
  readonly request: number;
  readonly value: number;
  readonly index: number;
}

export interface UsbTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;

  /** Vendor-specific control transfer, host → device (bmRequestType 0x40). */
  controlOut(setup: ControlSetup, data?: BufferSource): Promise<void>;

  /** Vendor-specific control transfer, device → host (bmRequestType 0xC0). */
  controlIn(setup: ControlSetup, length: number): Promise<Uint8Array>;

  /** Bulk OUT to the given endpoint number (1-15, no direction bit). */
  bulkOut(endpoint: number, data: BufferSource): Promise<void>;

  /** Bulk IN from the given endpoint number (1-15, no direction bit). */
  bulkIn(endpoint: number, length: number): Promise<Uint8Array>;
}
```

Note: we deliberately **don't** expose `USBOutTransferResult` directly.
We translate to a simpler shape (`void` on success, `Uint8Array` on
read). The WebUSB result object's `.status` is only ever `'ok'`, `'stall'`,
or `'babble'`; we throw on the latter two and return on `'ok'`.

## Mock implementation outline

```ts
// src/transport.mock.ts

export interface RecordedControlOut {
  setup: ControlSetup;
  data: Uint8Array | undefined;
}

export interface RecordedBulkOut {
  endpoint: number;
  data: Uint8Array;
}

export class MockUsbTransport implements UsbTransport {
  isOpen = false;
  selectedConfig: number | null = null;
  claimedInterfaces: number[] = [];
  releasedInterfaces: number[] = [];

  controlOutCalls: RecordedControlOut[] = [];
  controlInCalls: { setup: ControlSetup; length: number }[] = [];
  bulkOutCalls: RecordedBulkOut[] = [];
  bulkInCalls: { endpoint: number; length: number }[] = [];

  // Test pre-loads these queues; mock dequeues on each transferIn call
  private controlInQueue: Uint8Array[] = [];
  private bulkInQueue: Uint8Array[] = [];

  /** Pre-load a response for the next controlIn call. */
  enqueueControlInResponse(data: Uint8Array): void {
    this.controlInQueue.push(data);
  }

  /** Pre-load a response for the next bulkIn call. */
  enqueueBulkInResponse(data: Uint8Array): void {
    this.bulkInQueue.push(data);
  }

  async open() { this.isOpen = true; }
  async close() { this.isOpen = false; }
  async selectConfiguration(n: number) { this.selectedConfig = n; }
  async claimInterface(n: number) { this.claimedInterfaces.push(n); }
  async releaseInterface(n: number) { this.releasedInterfaces.push(n); }

  async controlOut(setup: ControlSetup, data?: BufferSource) {
    this.controlOutCalls.push({
      setup,
      data: data === undefined ? undefined : toUint8Array(data),
    });
  }

  async controlIn(setup: ControlSetup, length: number): Promise<Uint8Array> {
    this.controlInCalls.push({ setup, length });
    return this.controlInQueue.shift() ?? new Uint8Array(0);
  }

  async bulkOut(endpoint: number, data: BufferSource) {
    this.bulkOutCalls.push({ endpoint, data: toUint8Array(data) });
  }

  async bulkIn(endpoint: number, length: number): Promise<Uint8Array> {
    this.bulkInCalls.push({ endpoint, length });
    return this.bulkInQueue.shift() ?? new Uint8Array(0);
  }
}

function toUint8Array(src: BufferSource): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
}
```

## WebUsbTransport implementation outline

```ts
// src/transport.webusb.ts

export class WebUsbTransport implements UsbTransport {
  constructor(private readonly device: USBDevice) {}

  async open() { await this.device.open(); }
  async close() { await this.device.close(); }
  async selectConfiguration(n: number) { await this.device.selectConfiguration(n); }
  async claimInterface(n: number) { await this.device.claimInterface(n); }
  async releaseInterface(n: number) { await this.device.releaseInterface(n); }

  async controlOut(setup: ControlSetup, data?: BufferSource) {
    const result = await this.device.controlTransferOut(
      {
        requestType: 'vendor',
        recipient: 'device',
        request: setup.request,
        value: setup.value,
        index: setup.index,
      },
      data,
    );
    if (result.status !== 'ok') {
      throw new TransferError('controlOut', setup, result.status);
    }
  }

  async controlIn(setup: ControlSetup, length: number): Promise<Uint8Array> {
    const result = await this.device.controlTransferIn(
      {
        requestType: 'vendor',
        recipient: 'device',
        request: setup.request,
        value: setup.value,
        index: setup.index,
      },
      length,
    );
    if (result.status !== 'ok') {
      throw new TransferError('controlIn', setup, result.status);
    }
    return new Uint8Array(result.data!.buffer);
  }

  async bulkOut(endpoint: number, data: BufferSource) {
    const result = await this.device.transferOut(endpoint, data);
    if (result.status !== 'ok') {
      throw new TransferError('bulkOut', { request: endpoint, value: 0, index: 0 }, result.status);
    }
  }

  async bulkIn(endpoint: number, length: number): Promise<Uint8Array> {
    const result = await this.device.transferIn(endpoint, length);
    if (result.status !== 'ok') {
      throw new TransferError('bulkIn', { request: endpoint, value: 0, index: 0 }, result.status);
    }
    return new Uint8Array(result.data!.buffer);
  }
}

export class TransferError extends Error {
  constructor(
    public readonly op: string,
    public readonly setup: ControlSetup,
    public readonly status: string,
  ) {
    super(`USB ${op} failed: status=${status}, setup=${JSON.stringify(setup)}`);
  }
}
```

## TDD walkthrough

### Step 5.1 — Mock records control-out calls

```ts
import { describe, it, expect } from 'vitest';
import { MockUsbTransport } from './transport.mock.js';

describe('MockUsbTransport', () => {
  it('records controlOut setup and data', async () => {
    const mock = new MockUsbTransport();
    const data = new Uint8Array([0x01, 0x02]);
    await mock.controlOut({ request: 0x04, value: 0x0008, index: 0 }, data);

    expect(mock.controlOutCalls).toHaveLength(1);
    expect(mock.controlOutCalls[0]!.setup).toEqual({
      request: 0x04, value: 0x0008, index: 0,
    });
    expect(mock.controlOutCalls[0]!.data).toEqual(data);
  });
});
```

Red → commit: `test(usb-mock): assert controlOut is recorded`

Green → commit: `feat(usb-mock): implement MockUsbTransport.controlOut recording`

### Step 5.2 — Mock returns enqueued bulk-IN data

```ts
  it('returns enqueued bulk-IN data in FIFO order', async () => {
    const mock = new MockUsbTransport();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x41]));
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x42]));

    const first = await mock.bulkIn(1, 64);
    const second = await mock.bulkIn(1, 64);

    expect(Array.from(first)).toEqual([0x01, 0x60, 0x41]);
    expect(Array.from(second)).toEqual([0x01, 0x60, 0x42]);
  });

  it('returns empty array when bulk-IN queue is empty', async () => {
    const mock = new MockUsbTransport();
    expect(await mock.bulkIn(1, 64)).toEqual(new Uint8Array(0));
  });
```

Red → commit: `test(usb-mock): assert bulk-IN queue dequeues in FIFO order`

Green → commit: `feat(usb-mock): implement bulk-IN response queue`

### Step 5.3 — Lifecycle methods record state

```ts
  it('tracks open/close lifecycle', async () => {
    const mock = new MockUsbTransport();
    expect(mock.isOpen).toBe(false);
    await mock.open();
    expect(mock.isOpen).toBe(true);
    await mock.close();
    expect(mock.isOpen).toBe(false);
  });

  it('tracks claimed and released interfaces', async () => {
    const mock = new MockUsbTransport();
    await mock.claimInterface(0);
    expect(mock.claimedInterfaces).toEqual([0]);
    await mock.releaseInterface(0);
    expect(mock.releasedInterfaces).toEqual([0]);
  });
```

Red → green → commit.

### Step 5.4 — WebUsbTransport

`WebUsbTransport` is hard to test in Vitest's node environment because it
needs a real `USBDevice`. Two options:

(a) **Skip its unit tests entirely.** Cover it indirectly via the
hardware-in-loop tests in Phase 9. This is the pragmatic choice.

(b) **Build a "fake USBDevice"** that implements the W3C interface and
test against it. More code, more confidence, but doubles the mock
surface area.

Go with (a). Document this in TESTING.md (we already did).

Just implement `WebUsbTransport` and ship it. Commit:

```
feat(device): add WebUsbTransport adapter for real USBDevice

Wraps a w3c USBDevice and forwards each UsbTransport method to the
appropriate device method, translating result status into thrown
TransferError where needed. Not unit-tested directly; covered by
hardware-in-loop tests in Phase 9.
```

## Acceptance checklist

- [ ] `UsbTransport` interface exported from `src/index.ts`
- [ ] `MockUsbTransport` exported as `ftdi-webusb-driver/testing` subpath
- [ ] `WebUsbTransport` exported from `src/index.ts`
- [ ] All mock methods have at least one test
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean
- [ ] Branch merged
