import { describe, it, expect } from 'vitest';
import { MockUsbTransport } from './transport.mock.js';

describe('MockUsbTransport.controlOut', () => {
  it('records setup and data', async () => {
    const mock = new MockUsbTransport();
    const data = new Uint8Array([0x01, 0x02]);
    await mock.controlOut({ request: 0x04, value: 0x0008, index: 0 }, data);

    expect(mock.controlOutCalls).toHaveLength(1);
    const call = mock.controlOutCalls.at(0);
    expect(call?.setup).toEqual({ request: 0x04, value: 0x0008, index: 0 });
    expect(call?.data).toEqual(data);
  });

  it('records undefined data when none is provided', async () => {
    const mock = new MockUsbTransport();
    await mock.controlOut({ request: 0x00, value: 0, index: 0 });
    expect(mock.controlOutCalls.at(0)?.data).toBeUndefined();
  });
});

describe('MockUsbTransport.bulkIn', () => {
  it('returns enqueued responses in FIFO order', async () => {
    const mock = new MockUsbTransport();
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x41]));
    mock.enqueueBulkInResponse(new Uint8Array([0x01, 0x60, 0x42]));

    const first = await mock.bulkIn(1, 64);
    const second = await mock.bulkIn(1, 64);

    expect(Array.from(first)).toEqual([0x01, 0x60, 0x41]);
    expect(Array.from(second)).toEqual([0x01, 0x60, 0x42]);
  });

  it('resolves with empty array when mock is closed with a pending request', async () => {
    const mock = new MockUsbTransport();
    const pending = mock.bulkIn(1, 64); // blocks — queue is empty
    await mock.close(); // flushes pending resolvers with []
    expect(await pending).toEqual(new Uint8Array(0));
  });

  it('wakes a blocked bulkIn when data is enqueued after the call', async () => {
    const mock = new MockUsbTransport();
    const pending = mock.bulkIn(1, 64); // blocks
    mock.enqueueBulkInResponse(new Uint8Array([0xff])); // wakes it
    expect(Array.from(await pending)).toEqual([0xff]);
  });

  it('records each bulkIn call with endpoint and length', async () => {
    const mock = new MockUsbTransport();
    const pending = mock.bulkIn(1, 64); // blocks (empty queue)
    await mock.close(); // resolves it
    await pending;
    expect(mock.bulkInCalls).toEqual([{ endpoint: 1, length: 64 }]);
  });
});

describe('MockUsbTransport.controlIn', () => {
  it('returns enqueued controlIn responses in FIFO order', async () => {
    const mock = new MockUsbTransport();
    mock.enqueueControlInResponse(new Uint8Array([0x01, 0x60]));

    const data = await mock.controlIn({ request: 0x05, value: 0, index: 0 }, 2);
    expect(Array.from(data)).toEqual([0x01, 0x60]);
  });

  it('returns empty array when controlIn queue is empty', async () => {
    const mock = new MockUsbTransport();
    expect(await mock.controlIn({ request: 0x05, value: 0, index: 0 }, 2)).toEqual(
      new Uint8Array(0),
    );
  });
});

describe('MockUsbTransport lifecycle', () => {
  it('tracks open and close', async () => {
    const mock = new MockUsbTransport();
    expect(mock.isOpen).toBe(false);
    await mock.open();
    expect(mock.isOpen).toBe(true);
    await mock.close();
    expect(mock.isOpen).toBe(false);
  });

  it('tracks selectConfiguration', async () => {
    const mock = new MockUsbTransport();
    await mock.selectConfiguration(1);
    expect(mock.selectedConfig).toBe(1);
  });

  it('tracks claimed and released interfaces', async () => {
    const mock = new MockUsbTransport();
    await mock.claimInterface(0);
    expect(mock.claimedInterfaces).toEqual([0]);
    await mock.releaseInterface(0);
    expect(mock.releasedInterfaces).toEqual([0]);
  });
});
