# PHASE-07-read-write.md — Read and write paths

Branch: `phase/07-read-write`

## Goals

Add `read()` and `write()` to `FtdiUart`. Both delegate to the transport
but apply the FTDI-specific rules:

- `write` chunks input into ≤64-byte transfers.
- `read` strips the 2-byte status header and returns just the payload.

## API

```ts
class FtdiUart {
  // ... existing methods

  /** Write data; splits into max-packet-size chunks. */
  async write(data: BufferSource): Promise<void>;

  /** Read up to `maxBytes` of UART payload (status header stripped). */
  async read(maxBytes?: number): Promise<Uint8Array>;
}
```

## TDD walkthrough

### Step 7.1 — Empty write is a no-op

```ts
describe('FtdiUart.write', () => {
  it('does not issue any bulkOut for empty input', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    await ftdi.write(new Uint8Array(0));
    expect(mock.bulkOutCalls).toEqual([]);
  });
});
```

Red → commit: `test(write): assert empty write is a no-op`

```ts
async write(data: BufferSource): Promise<void> {
  const bytes = toUint8Array(data);
  if (bytes.length === 0) return;
  // chunking comes in next step
}
```

Green → commit: `feat(write): short-circuit empty writes`

### Step 7.2 — Single-packet write

```ts
  it('issues one bulkOut for ≤ maxPacketSize input', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    const data = new Uint8Array([0x48, 0x49]); // "HI"
    await ftdi.write(data);

    expect(mock.bulkOutCalls).toHaveLength(1);
    expect(mock.bulkOutCalls[0]).toEqual({ endpoint: 2, data });
  });

  it('issues one bulkOut for exactly 64 bytes (no zero-length packet)', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    const data = new Uint8Array(64).fill(0xAA);
    await ftdi.write(data);

    expect(mock.bulkOutCalls).toHaveLength(1);
    expect(mock.bulkOutCalls[0]!.data.length).toBe(64);
  });
```

Red → commit: `test(write): cover single-packet writes including 64-byte boundary`

```ts
async write(data: BufferSource): Promise<void> {
  const bytes = toUint8Array(data);
  if (bytes.length === 0) return;

  let offset = 0;
  while (offset < bytes.length) {
    const chunk = bytes.subarray(offset, offset + this.maxPacketSize);
    await this.transport.bulkOut(this.bulkOutEndpoint, chunk);
    offset += chunk.length;
  }
}
```

Green → commit: `feat(write): chunk writes at maxPacketSize boundary`

### Step 7.3 — Multi-packet write

```ts
  it('issues two bulkOuts for 65 bytes (64 + 1)', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    const data = new Uint8Array(65).fill(0xBB);
    await ftdi.write(data);

    expect(mock.bulkOutCalls).toHaveLength(2);
    expect(mock.bulkOutCalls[0]!.data.length).toBe(64);
    expect(mock.bulkOutCalls[1]!.data.length).toBe(1);
  });

  it('issues four bulkOuts for 256 bytes', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    const data = new Uint8Array(256).fill(0xCC);
    await ftdi.write(data);

    expect(mock.bulkOutCalls).toHaveLength(4);
    expect(mock.bulkOutCalls.every(c => c.data.length === 64)).toBe(true);
  });
```

Should already pass from the loop in 7.2. Commit as regression:
`test(write): cover multi-packet chunking`

### Step 7.4 — Read idle

```ts
describe('FtdiUart.read', () => {
  it('returns empty array for idle packet (only status bytes)', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));
    const payload = await ftdi.read();

    expect(payload).toEqual(new Uint8Array(0));
  });
});
```

Red → commit: `test(read): assert idle packet yields empty payload`

```ts
async read(maxBytes: number = this.maxPacketSize): Promise<Uint8Array> {
  const raw = await this.transport.bulkIn(this.bulkInEndpoint, maxBytes);
  const { payload } = stripStatus(raw);
  return payload;
}
```

Green → commit: `feat(read): implement read with status stripping`

### Step 7.5 — Read with payload

```ts
  it('returns stripped payload for non-idle packet', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    mock.enqueueBulkInResponse(new Uint8Array([
      0x01, 0x60, 0x48, 0x65, 0x6C, 0x6C, 0x6F,
    ]));
    const payload = await ftdi.read();

    expect(Array.from(payload)).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
  });

  it('passes through maxBytes to the underlying bulkIn', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));

    await ftdi.read(128);
    expect(mock.bulkInCalls).toHaveLength(1);
    expect(mock.bulkInCalls[0]!.length).toBe(128);
  });
```

Green from 7.4. Commit: `test(read): cover payload extraction and maxBytes pass-through`

### Step 7.6 — Refactor

The `toUint8Array` helper used in `write` should be co-located with where
it's used or pulled into a shared util module. Keep it private to
`ftdi-uart.ts` for now — extract only if a second caller appears.

If the `read`/`write` methods feel too implementation-heavy on `FtdiUart`,
consider extracting a separate `FtdiDataChannel` class. Don't do this
unless it makes tests clearer.

## Acceptance checklist

- [ ] All chunking edge cases pass (empty, sub-packet, exact, over)
- [ ] All read shapes pass (idle, payload, custom maxBytes)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean
- [ ] Branch merged
