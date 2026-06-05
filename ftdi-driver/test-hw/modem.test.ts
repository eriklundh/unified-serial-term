/**
 * Modem truth-table test — requires RTS→CTS and DTR→DSR wired as loopback.
 * Gate: FTDI_HW_MODEM=1 (in addition to FTDI_HW_TEST=1).
 *
 * The FT231XS has active-low RS-232 signals:
 *   RTS=true  → RTS# pin low  → if jumpered, CTS# sees low  → CTS bit set in status
 *   RTS=false → RTS# pin high → if jumpered, CTS# sees high → CTS bit clear
 *   DTR=true  → DTR# pin low  → if jumpered, DSR# sees low  → DSR bit set in status
 *   DTR=false → DTR# pin high → if jumpered, DSR# sees high → DSR bit clear
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FtdiUart } from '../src/index.js';
import { getTestDevice } from './setup.js';

const MODEM_WIRED = !!process.env.FTDI_HW_MODEM;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.runIf(MODEM_WIRED)('modem truth-table (RTS→CTS, DTR→DSR loopback)', () => {
  let ftdi: FtdiUart;

  beforeAll(async () => {
    const device = await getTestDevice();
    ftdi = await FtdiUart.open(device);
    await ftdi.configure({ baud: 9600, dtr: false, rts: false });
    await sleep(20);
  });

  afterAll(async () => {
    await ftdi?.close();
  });

  const rows: { dtr: boolean; rts: boolean }[] = [
    { dtr: false, rts: false },
    { dtr: false, rts: true },
    { dtr: true, rts: false },
    { dtr: true, rts: true },
  ];

  for (const { dtr, rts } of rows) {
    it(`DTR=${dtr} RTS=${rts} → DSR=${dtr} CTS=${rts}`, async () => {
      await ftdi.setModemControl({ dtr, rts });
      await sleep(20);
      const status = await ftdi.getModemStatus();
      expect(status.dsr, 'DSR').toBe(dtr);
      expect(status.cts, 'CTS').toBe(rts);
    });
  }
});
