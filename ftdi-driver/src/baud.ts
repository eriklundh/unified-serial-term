export interface BaudDivisor {
  readonly wValue: number;
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

  // divisor3 is the BRG divisor scaled by 8, capturing the fractional part
  // in its low 3 bits.
  const divisor3 = Math.floor(FT232BM_BASE_CLOCK / 2 / baud);

  const fracCode = DIVFRAC[divisor3 & 7] ?? 0;
  let divisor = (divisor3 >>> 3) | (fracCode << 14);

  // Special remappings for the highest two reachable baud rates.
  if (divisor === 1) divisor = 0; // 3 Mbaud
  else if (divisor === 0x4001) divisor = 1; // 2 Mbaud

  return {
    wValue: divisor & 0xffff,
    wIndex: (divisor >>> 16) & 0xffff,
  };
}
