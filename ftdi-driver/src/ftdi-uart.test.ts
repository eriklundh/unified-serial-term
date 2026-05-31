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
