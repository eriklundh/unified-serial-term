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
    await ftdi?.close();
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
