import { describe, it, expect } from 'vitest';
import { FtdiUart } from './ftdi-uart.js';
import { MockUsbTransport } from './transport.mock.js';

async function openedPair(): Promise<{ mock: MockUsbTransport; ftdi: FtdiUart }> {
  const mock = new MockUsbTransport();
  const ftdi = new FtdiUart(mock);
  await ftdi.open();
  mock.bulkOutCalls.length = 0;
  return { mock, ftdi };
}

describe('FtdiUart.readable', () => {
  it('yields stripped payloads from queued bulk-IN responses', async () => {
    const { mock, ftdi } = await openedPair();

    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x41]));
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x42]));

    const reader = ftdi.readable.getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(Array.from(first.value ?? [])).toEqual([0x41]);
    expect(Array.from(second.value ?? [])).toEqual([0x42]);

    await reader.cancel();
    // close() flushes any proactive blocked bulkIn that the stream queued
    await ftdi.close();
  });

  it('skips idle packets and delivers the first non-empty payload', async () => {
    const { mock, ftdi } = await openedPair();

    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60])); // idle
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60])); // idle
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0xab])); // data

    const reader = ftdi.readable.getReader();
    const result = await reader.read();

    expect(Array.from(result.value ?? [])).toEqual([0xab]);

    await reader.cancel();
    await ftdi.close();
  });
});

describe('FtdiUart.writable', () => {
  it('forwards each chunk to bulkOut', async () => {
    const { mock, ftdi } = await openedPair();

    const writer = ftdi.writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4, 5]));
    await writer.close();

    expect(mock.bulkOutCalls).toHaveLength(2);
    expect(Array.from(mock.bulkOutCalls.at(0)?.data ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(mock.bulkOutCalls.at(1)?.data ?? [])).toEqual([4, 5]);

    await ftdi.close();
  });
});

describe('FtdiUart.close with pending reader', () => {
  it('errors the readable stream when the driver is closed', async () => {
    const { ftdi } = await openedPair();

    const reader = ftdi.readable.getReader();
    // reader.read() blocks: bulkIn has an empty queue and genuinely blocks.
    const readPromise = reader.read();

    // close() aborts the signal, then calls transport.close() which resolves
    // the blocked bulkIn with []. The pull then sees signal.aborted and calls
    // controller.error(), rejecting readPromise.
    await ftdi.close();

    await expect(readPromise).rejects.toBeDefined();
  });
});
