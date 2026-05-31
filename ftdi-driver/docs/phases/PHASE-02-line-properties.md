# PHASE-02-line-properties.md — Line properties encoder

Branch: `phase/02-line-properties`

## Goal

Implement `encodeLineProperties(opts) → number` that produces the correct
`wValue` for the `SIO_SET_DATA` (request `0x04`) control transfer.

```ts
type Parity = 'none' | 'odd' | 'even' | 'mark' | 'space';
type StopBits = 1 | 1.5 | 2;
type DataBits = 5 | 6 | 7 | 8;

interface LineProperties {
  dataBits: DataBits;
  parity: Parity;
  stopBits: StopBits;
  breakOn?: boolean;
}

function encodeLineProperties(opts: LineProperties): number;
```

## Encoding reference

From `ftdi_sio.h`, `wValue` is:

```
 15  14    13 12 11    10  9  8     7   6   5   4   3   2   1   0
+--+-----+------------+-----------+--------------------------------+
|0 | BRK |  stop bits | parity    |        data bits literal       |
+--+-----+------------+-----------+--------------------------------+
```

- **Data bits** [7:0]: literal number (5, 6, 7, or 8).
- **Parity** [10:8]: `none=0`, `odd=1`, `even=2`, `mark=3`, `space=4`.
- **Stop bits** [13:11]: `1=0`, `1.5=1`, `2=2`.
- **Break** [14]: `1` to assert.

## TDD walkthrough

### Step 2.1 — One vector, one test

```ts
import { describe, it, expect } from 'vitest';
import { encodeLineProperties } from './line.js';

describe('encodeLineProperties', () => {
  it('returns 0x0008 for 8N1', () => {
    expect(encodeLineProperties({
      dataBits: 8, parity: 'none', stopBits: 1
    })).toBe(0x0008);
  });
});
```

Red → commit: `test(line): add failing test for 8N1 encoding`

### Step 2.2 — Stub it

```ts
export function encodeLineProperties(opts: any): number {
  return 0x0008;
}
```

Green → commit: `feat(line): stub encodeLineProperties returning 8N1`

### Step 2.3 — Table of vectors

```ts
const VECTORS = [
  // dataBits, parity,   stopBits, breakOn, expected
  [8, 'none',  1, false, 0x0008],
  [7, 'even',  1, false, 0x0207],   // matches the user's USB capture
  [8, 'odd',   2, false, 0x1108],
  [5, 'none',  1, false, 0x0005],
  [6, 'mark',  1, false, 0x0306],
  [8, 'space', 1.5, false, 0x0C08],
  [8, 'none',  1, true,  0x4008],   // BREAK asserted
  [7, 'odd',   2, true,  0x5107],
] as const;

describe('encodeLineProperties', () => {
  it.each(VECTORS)(
    '%i-data %s-parity %s-stop break=%s → 0x%s',
    (dataBits, parity, stopBits, breakOn, expected) => {
      expect(encodeLineProperties({
        dataBits, parity, stopBits, breakOn,
      } as LineProperties)).toBe(expected);
    },
  );
});
```

Red on most → commit: `test(line): add full encoding vector table`

### Step 2.4 — Real implementation

```ts
const PARITY_CODES = {
  none: 0, odd: 1, even: 2, mark: 3, space: 4,
} as const;

const STOP_CODES = {
  1: 0, 1.5: 1, 2: 2,
} as const;

const VALID_DATA_BITS = new Set([5, 6, 7, 8]);

export function encodeLineProperties(opts: LineProperties): number {
  return (opts.dataBits & 0xFF)
    | (PARITY_CODES[opts.parity] << 8)
    | (STOP_CODES[opts.stopBits] << 11)
    | (opts.breakOn ? (1 << 14) : 0);
}
```

Green → commit: `feat(line): implement encoding per ftdi_sio.h layout`

### Step 2.5 — Validation tests

```ts
describe('encodeLineProperties validation', () => {
  it('throws RangeError for invalid data bits', () => {
    expect(() => encodeLineProperties({
      dataBits: 4 as DataBits, parity: 'none', stopBits: 1,
    })).toThrow(RangeError);
  });

  it('throws RangeError for invalid parity', () => {
    expect(() => encodeLineProperties({
      dataBits: 8, parity: 'foo' as Parity, stopBits: 1,
    })).toThrow(RangeError);
  });

  it('throws RangeError for invalid stop bits', () => {
    expect(() => encodeLineProperties({
      dataBits: 8, parity: 'none', stopBits: 3 as StopBits,
    })).toThrow(RangeError);
  });
});
```

Red → commit: `test(line): cover invalid data bits, parity, stop bits`

### Step 2.6 — Add validation

```ts
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
  // ... encode as before
}
```

Green → commit: `feat(line): validate inputs and throw RangeError`

### Step 2.7 — Refactor

The PARITY_CODES / STOP_CODES tables and the `LineProperties` type want
to live in a shared types module. Move them out, re-run tests, commit:
`refactor(line): hoist constants and types to types module`.

## Acceptance checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` clean (note: TypeScript's union-of-literal types
      for `Parity`, `StopBits`, `DataBits` makes most invalid inputs
      compile-time errors, but runtime validation still tested via casts)
- [ ] `npm run lint` clean
- [ ] Branch merged
