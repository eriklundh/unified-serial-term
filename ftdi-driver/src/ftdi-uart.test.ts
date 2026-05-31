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

describe('FtdiUart.configure', () => {
  it('issues the verified setup sequence for 115200 8N1', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.controlOutCalls.length = 0; // clear open() noise
    mock.enqueueControlInResponse(new Uint8Array([0x01, 0x60])); // GET_MODEM_STATUS reply

    await ftdi.configure({ baud: 115200 });

    expect(mock.controlOutCalls.map((c) => c.setup)).toEqual([
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
      { request: 0x03, value: 0x001a, index: 0x0000 },
      // 7. Set latency timer (16 ms default)
      { request: 0x09, value: 0x0010, index: 0x0000 },
    ]);

    expect(mock.controlInCalls).toHaveLength(1);
    expect(mock.controlInCalls.at(0)?.setup).toEqual({
      request: 0x05,
      value: 0x0000,
      index: 0x0000,
    });
  });

  it('encodes 7E1 line properties as 0x0207 through configure path', async () => {
    const mock = new MockUsbTransport();
    const ftdi = new FtdiUart(mock);
    await ftdi.open();
    mock.controlOutCalls.length = 0;
    mock.enqueueControlInResponse(new Uint8Array([0x01, 0x60]));

    await ftdi.configure({ baud: 9600, dataBits: 7, parity: 'even', stopBits: 1 });

    const setDataCall = mock.controlOutCalls.find((c) => c.setup.request === 0x04);
    expect(setDataCall?.setup.value).toBe(0x0207);
  });
});

describe('FtdiUart.open (static factory)', () => {
  it('builds WebUsbTransport from USBDevice and opens', async () => {
    const calls: string[] = [];
    const fakeDevice = {
      open: async () => {
        calls.push('open');
      },
      selectConfiguration: async () => {
        calls.push('select');
      },
      claimInterface: async () => {
        calls.push('claim');
      },
    } as unknown as USBDevice;

    const ftdi = await FtdiUart.open(fakeDevice);
    expect(calls).toEqual(['open', 'select', 'claim']);
    expect(ftdi).toBeInstanceOf(FtdiUart);
  });
});
