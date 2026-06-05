import type { LineProperties } from './types.js';

export type { Parity, StopBits, DataBits, LineProperties } from './types.js';

const PARITY_CODES = { none: 0, odd: 1, even: 2, mark: 3, space: 4 } as const;
const STOP_CODES = { 1: 0, 1.5: 1, 2: 2 } as const;
const VALID_DATA_BITS = new Set<number>([5, 6, 7, 8]);

/**
 * Encode line-format parameters into the `wValue` for the `SIO_SET_DATA`
 * control request (request `0x04`).
 *
 * Bit layout (per `ftdi_sio.h`):
 * - bits [7:0]  — data bits (literal)
 * - bits [10:8] — parity (0=N, 1=O, 2=E, 3=M, 4=S)
 * - bits [13:11] — stop bits (0=1, 1=1.5, 2=2)
 * - bit  [14]   — break enable
 *
 * @throws {RangeError} on invalid data-bits, parity, or stop-bits values.
 */
export function encodeLineProperties(opts: LineProperties): number {
  if (!VALID_DATA_BITS.has(opts.dataBits)) {
    throw new RangeError(`dataBits must be 5/6/7/8: got ${opts.dataBits}`);
  }
  if (!(opts.parity in PARITY_CODES)) {
    throw new RangeError(`unknown parity: ${opts.parity}`);
  }
  if (!(opts.stopBits in STOP_CODES)) {
    throw new RangeError(`stopBits must be 1, 1.5, or 2: got ${opts.stopBits}`);
  }

  return (
    (opts.dataBits & 0xff) |
    (PARITY_CODES[opts.parity] << 8) |
    (STOP_CODES[opts.stopBits] << 11) |
    (opts.breakOn === true ? 1 << 14 : 0)
  );
}
