import { describe, it, expect } from 'vitest';
import { FtdiUart } from './ftdi-uart.js';
import { MockUsbTransport } from './transport.mock.js';

async function openedPair(): Promise<{ mock: MockUsbTransport; ftdi: FtdiUart }> {
  const mock = new MockUsbTransport();
  const ftdi = new FtdiUart(mock);
  await ftdi.open();
  mock.bulkOutCalls.length = 0;
  mock.bulkInCalls.length = 0;
  return { mock, ftdi };
}

describe('FtdiUart.write', () => {
  it('does not issue any bulkOut for empty input', async () => {
    const { mock, ftdi } = await openedPair();
    await ftdi.write(new Uint8Array(0));
    expect(mock.bulkOutCalls).toEqual([]);
  });

  it('issues one bulkOut for a small payload', async () => {
    const { mock, ftdi } = await openedPair();
    const data = new Uint8Array([0x48, 0x49]);
    await ftdi.write(data);
    expect(mock.bulkOutCalls).toHaveLength(1);
    expect(mock.bulkOutCalls.at(0)).toEqual({ endpoint: 2, data });
  });

  it('issues one bulkOut for exactly 64 bytes (no extra zero-length packet)', async () => {
    const { mock, ftdi } = await openedPair();
    const data = new Uint8Array(64).fill(0xaa);
    await ftdi.write(data);
    expect(mock.bulkOutCalls).toHaveLength(1);
    expect(mock.bulkOutCalls.at(0)?.data.length).toBe(64);
  });

  it('issues two bulkOuts for 65 bytes (64 + 1)', async () => {
    const { mock, ftdi } = await openedPair();
    const data = new Uint8Array(65).fill(0xbb);
    await ftdi.write(data);
    expect(mock.bulkOutCalls).toHaveLength(2);
    expect(mock.bulkOutCalls.at(0)?.data.length).toBe(64);
    expect(mock.bulkOutCalls.at(1)?.data.length).toBe(1);
  });

  it('issues four bulkOuts for 256 bytes', async () => {
    const { mock, ftdi } = await openedPair();
    const data = new Uint8Array(256).fill(0xcc);
    await ftdi.write(data);
    expect(mock.bulkOutCalls).toHaveLength(4);
    expect(mock.bulkOutCalls.every((c) => c.data.length === 64)).toBe(true);
  });
});

describe('FtdiUart.read', () => {
  it('returns empty array for idle packet (only status bytes)', async () => {
    const { mock, ftdi } = await openedPair();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));
    const payload = await ftdi.read();
    expect(payload).toEqual(new Uint8Array(0));
  });

  it('returns stripped payload for non-idle packet', async () => {
    const { mock, ftdi } = await openedPair();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    const payload = await ftdi.read();
    expect(Array.from(payload)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('passes maxBytes through to the underlying bulkIn call', async () => {
    const { mock, ftdi } = await openedPair();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60]));
    await ftdi.read(128);
    expect(mock.bulkInCalls.at(0)?.length).toBe(128);
  });
});
