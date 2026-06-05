import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

describe('baud cycling', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
  });

  afterAll(async () => {
    await ftdi?.close();
  });

  for (const baud of [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]) {
    it(`reconfigures to ${baud} baud without error`, async () => {
      await expect(ftdi.configure({ baud })).resolves.not.toThrow();
    });
  }
});
