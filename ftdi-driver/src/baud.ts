/** Encoded baud-rate divisor for the `SIO_SET_BAUD_RATE` control request. */
export interface BaudDivisor {
  /** Low 16 bits of the encoded divisor (wValue field of the control transfer). */
  readonly wValue: number;
  /** High 16 bits of the encoded divisor (wIndex field of the control transfer). */
  readonly wIndex: number;
}

/**
 * Maps the low 3 bits of the unscaled divisor to the 3-bit fractional-
 * divisor code in the encoded result. This is a permutation, NOT eighths.
 *
 * Taken verbatim from Linux kernel drivers/usb/serial/ftdi_sio.c,
 * ftdi_232bm_baud_base_to_divisor().
 */
const DIVFRAC = [0, 3, 2, 4, 1, 5, 6, 7] as const;

const FT232BM_BASE_CLOCK = 48_000_000;

function rawDivisor(baud: number): number {
  const divisor3 = Math.floor(FT232BM_BASE_CLOCK / 2 / baud);
  const fracCode = DIVFRAC[divisor3 & 7] ?? 0;
  let d = (divisor3 >>> 3) | (fracCode << 14);
  if (d === 1) d = 0; // 3 Mbaud
  else if (d === 0x4001) d = 1; // 2 Mbaud
  return d;
}

/**
 * Convert a baud rate to the FTDI 232BM-family divisor encoding.
 *
 * Implements the algorithm from Linux kernel `ftdi_232bm_baud_base_to_divisor()`
 * in `drivers/usb/serial/ftdi_sio.c`. Supports 300 – 3 000 000 baud.
 *
 * @throws {RangeError} if `baud` is non-finite, ≤ 0, or > 3 000 000.
 */
export function baudToDivisor(baud: number): BaudDivisor {
  if (!Number.isFinite(baud)) {
    throw new RangeError(`baud must be a finite number: ${baud}`);
  }
  if (baud <= 0) {
    throw new RangeError(`baud must be positive: ${baud}`);
  }
  if (baud > 3_000_000) {
    throw new RangeError(`baud too high (max 3_000_000): ${baud}`);
  }

  const divisor = rawDivisor(baud);
  return {
    wValue: divisor & 0xffff,
    wIndex: (divisor >>> 16) & 0xffff,
  };
}
