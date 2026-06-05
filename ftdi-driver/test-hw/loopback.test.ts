import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

describe('loopback (TX/RX shorted)', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
    await ftdi.configure({ baud: 115200, latencyMs: 4 });
  });

  afterAll(async () => {
    await ftdi?.close();
  });

  it('echoes a written PING back via loopback', async () => {
    const ping = new TextEncoder().encode('PING\n');
    await ftdi.write(ping);

    const collected: number[] = [];
    const deadline = Date.now() + 2000;
    while (collected.length < ping.length && Date.now() < deadline) {
      const chunk = await ftdi.read();
      collected.push(...chunk);
    }

    expect(new TextDecoder().decode(new Uint8Array(collected))).toContain('PING');
  });
});
