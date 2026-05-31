import { describe, it, expect } from 'vitest';
import { encodeLineProperties } from './line.js';
import type { LineProperties, Parity, StopBits, DataBits } from './line.js';

const VECTORS = [
  // dataBits, parity,   stopBits, breakOn, expected
  [8, 'none', 1, false, 0x0008],
  [7, 'even', 1, false, 0x0207], // matches the user's USB capture
  [8, 'odd', 2, false, 0x1108],
  [5, 'none', 1, false, 0x0005],
  [6, 'mark', 1, false, 0x0306],
  [8, 'space', 1.5, false, 0x0c08],
  [8, 'none', 1, true, 0x4008], // BREAK asserted
  [7, 'odd', 2, true, 0x5107],
] as const;

describe('encodeLineProperties', () => {
  it.each(VECTORS)(
    '%i-data %s-parity %s-stop break=%s → 0x%s',
    (dataBits, parity, stopBits, breakOn, expected) => {
      expect(
        encodeLineProperties({ dataBits, parity, stopBits, breakOn } as LineProperties),
      ).toBe(expected);
    },
  );
});

describe('encodeLineProperties validation', () => {
  it('throws RangeError for invalid data bits', () => {
    expect(() =>
      encodeLineProperties({ dataBits: 4 as DataBits, parity: 'none', stopBits: 1 }),
    ).toThrow(RangeError);
  });

  it('throws RangeError for invalid parity', () => {
    expect(() =>
      encodeLineProperties({ dataBits: 8, parity: 'foo' as Parity, stopBits: 1 }),
    ).toThrow(RangeError);
  });

  it('throws RangeError for invalid stop bits', () => {
    expect(() =>
      encodeLineProperties({ dataBits: 8, parity: 'none', stopBits: 3 as StopBits }),
    ).toThrow(RangeError);
  });
});
