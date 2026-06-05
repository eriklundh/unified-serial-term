# PHASE-08-streams.md — Web Streams API

Branch: `phase/08-streams`

## Goal

Expose `readable: ReadableStream<Uint8Array>` and `writable:
WritableStream<Uint8Array>` on `FtdiUart`. This brings the driver into
the same shape as the Web Serial API and makes piping trivial:

```ts
// echo what the chip sends back to itself
await ftdi.readable.pipeTo(ftdi.writable);

// stream into xterm.js
const reader = ftdi.readable.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  term.write(new TextDecoder().decode(value));
}
```

## Design notes

The readable stream's `pull` runs a single `transferIn` per call and
strips status, then enqueues the payload (even if zero-length).
Empty enqueues are filtered out so consumers don't see idle packets:

```ts
async pull(controller) {
  const payload = await this.read();
  if (payload.length > 0) {
    controller.enqueue(payload);
  }
  // else: idle, just return — the next pull will try again
}
```

The writable's `write(chunk)` calls `FtdiUart.write(chunk)`.

**Cancellation matters.** When the consumer cancels the readable, an
in-flight `transferIn` will keep the underlying USB device busy until
it times out. WebUSB doesn't have a great cancel-in-flight story; the
pragmatic approach is to set a flag and let the next iteration check
it. The user closes the device via `FtdiUart.close()`, which we should
make safe to call while a stream is mid-read by also closing the
streams in `close()`.

## API

```ts
class FtdiUart {
  // ... existing

  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}
```

These are initialized in the constructor, **not** lazily. They start
producing/accepting as soon as you read or write to them; if the device
isn't open yet, the first underlying `transferIn` will throw.

## TDD walkthrough

Streams are async and event-driven, so tests need to be a little
careful. Vitest's `await` plus the standard streams API works fine.

### Step 8.1 — Readable yields stripped payloads

```ts
describe('FtdiUart.readable', () => {
  it('yields stripped payloads from queued bulk-IN responses', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x41]));
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x42]));

    const reader = ftdi.readable.getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(Array.from(first.value!)).toEqual([0x41]);
    expect(Array.from(second.value!)).toEqual([0x42]);

    await reader.cancel();
  });
});
```

Red → commit: `test(stream): assert readable surfaces stripped payloads`

```ts
constructor(transport: UsbTransport, opts?: FtdiUartOptions) {
  // ... existing setup
  this.readable = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const payload = await this.read();
      if (payload.length > 0) {
        controller.enqueue(payload);
      }
    },
  });
  this.writable = new WritableStream<Uint8Array>({
    write: async (chunk) => {
      await this.write(chunk);
    },
  });
}
```

Green → commit: `feat(stream): wire ReadableStream and WritableStream`

### Step 8.2 — Readable skips idle packets without ending the stream

```ts
  it('skips idle packets and waits for next non-empty', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));        // idle
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));        // idle
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0xAB]));  // data

    const reader = ftdi.readable.getReader();
    const result = await reader.read();
    expect(Array.from(result.value!)).toEqual([0xAB]);

    await reader.cancel();
  });
```

This will pass already because the `pull` function loops via the stream
machinery: when nothing is enqueued, the stream calls `pull` again. But
this only works if `pull` is async and the queue gets refilled per call.
Verify by running. If it doesn't pass, the fix is to make `pull` loop
internally:

```ts
pull: async (controller) => {
  while (true) {
    const payload = await this.read();
    if (payload.length > 0) {
      controller.enqueue(payload);
      return;
    }
    // else loop: read again immediately
  }
},
```

Tradeoff: looping internally is more responsive but ties up the pull
indefinitely if the device never sends data. With WebUSB timeouts in
play this is fine; without them, prefer the per-pull-one-poll approach.

**Recommended:** loop internally, since WebUSB has no per-transfer
timeout and we'll be in real trouble on a never-responding device
either way.

Commit: `test(stream): cover idle-packet skipping`
Commit: `feat(stream): loop internally on idle to keep stream readable`

### Step 8.3 — Writable accepts chunks

```ts
describe('FtdiUart.writable', () => {
  it('forwards chunks to FtdiUart.write', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.bulkOutCalls.length = 0;

    const writer = ftdi.writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4, 5]));
    await writer.close();

    expect(mock.bulkOutCalls).toHaveLength(2);
    expect(Array.from(mock.bulkOutCalls[0]!.data)).toEqual([1, 2, 3]);
    expect(Array.from(mock.bulkOutCalls[1]!.data)).toEqual([4, 5]);
  });
});
```

Red → green. Commit pair.

### Step 8.4 — close() tears down streams

```ts
  it('closing the driver while reader is pending cancels cleanly', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();

    const reader = ftdi.readable.getReader();
    const readPromise = reader.read(); // pending — no enqueued data

    // Close should reject the pending read by erroring the stream
    await ftdi.close();
    await expect(readPromise).rejects.toBeDefined();
  });
```

This requires `close()` to error the stream. Add an internal
`AbortController` whose `signal` is checked in the `pull` loop and a
`.abort()` call in `close()`:

```ts
private readonly readAbort = new AbortController();

// in constructor
this.readable = new ReadableStream({
  pull: async (controller) => {
    while (!this.readAbort.signal.aborted) {
      const payload = await this.read();
      if (payload.length > 0) {
        controller.enqueue(payload);
        return;
      }
    }
    controller.error(new Error('FtdiUart closed'));
  },
});

async close() {
  this.readAbort.abort();
  await this.transport.releaseInterface(this.interfaceNumber);
  await this.transport.close();
}
```

Commit pair: `test(stream): assert close() errors pending readers`,
`feat(stream): tear down readable on close via AbortController`

## Acceptance checklist

- [ ] Readable yields payloads in order
- [ ] Idle packets don't terminate or stall the stream
- [ ] Writable forwards each chunk
- [ ] `close()` errors pending reads cleanly
- [ ] `npm test`, `npm run typecheck`, `npm run lint` clean
- [ ] Branch merged
