# PHASE-01-baud.md — Baud rate divisor calculator

Branch: `phase/01-baud-divisor`

## Goal

Implement `baudToDivisor(baud: number) → { wValue: number, wIndex: number }`
as a pure function that exactly matches the canonical Linux `ftdi_sio.c`
algorithm for the FT232BM family (which covers FT232R and FT-X
including FT231XS).

## Why this phase first?

Three reasons:

1. **It's a pure function.** No mocks, no I/O, no async. The simplest possible
   environment in which to demonstrate the team's TDD discipline. If we can't
   do TDD properly for `baudToDivisor`, we won't do it properly for the harder
   stuff.

2. **The prior-art code got this catastrophically wrong.** The Python code
   used a 6-bit fractional table from AN232R-01 (which is for the old FT8U232AM
   chip, not the FT232BM family). The JS code used `baseClock = 3_000_000`
   with `* 8 / 8` rounding (a different, also-wrong, approximation). We need
   to install the correct algorithm with airtight regression coverage so
   nobody re-imports either bug.

3. **The captured USB data the previous chat used as "ground truth"
   (`wValue = 0x09C4`) was misinterpreted as 115200 baud, when it's actually
   1200 baud.** Working from a tested vector table from `ftdi_sio.c` removes
   the temptation to reason from one ambiguous capture.

## Files to create / touch

```
src/baud.ts            ← implementation
src/baud.test.ts       ← tests
scripts/gen-baud-vectors.mjs  ← regenerator (writes BAUD-VECTORS.md table)
```

## Step-by-step TDD walkthrough

The phase is **seven commits**: three red+green cycles plus a refactor.

### Step 1.1 — Failing test for a single happy-path vector

Create `src/baud.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { baudToDivisor } from './baud.js';

describe('baudToDivisor', () => {
  it('returns wValue=0x001A wIndex=0x0000 for 115200 baud', () => {
    expect(baudToDivisor(115200)).toEqual({ wValue: 0x001A, wIndex: 0x0000 });
  });
});
```

Run `npm test`. It fails because `baud.ts` doesn't exist. **Commit:**

```
test(baud): add failing test for 115200 baud reference vector
```

### Step 1.2 — Minimal green

Create `src/baud.ts`:

```ts
export interface BaudDivisor {
  readonly wValue: number;
  readonly wIndex: number;
}

export function baudToDivisor(baud: number): BaudDivisor {
  if (baud === 115200) {
    return { wValue: 0x001A, wIndex: 0x0000 };
  }
  throw new Error('not implemented');
}
```

Run `npm test`. Green. **Commit:**

```
feat(baud): stub baudToDivisor with hard-coded 115200 vector
```

Yes, this is laughably minimal. That's the point — don't write the algorithm
yet. Write it driven by the next failing test.

### Step 1.3 — Failing tests for the full vector table

Replace the single test with the full table from `BAUD-VECTORS.md`. Use
`it.each` for compactness:

```ts
import { describe, it, expect } from 'vitest';
import { baudToDivisor } from './baud.js';

const vectors: ReadonlyArray<readonly [number, number, number]> = [
  // baud, wValue, wIndex
  [300,        0x2710, 0x0000],
  [600,        0x1388, 0x0000],
  [1200,       0x09C4, 0x0000],
  [2400,       0x04E2, 0x0000],
  [4800,       0x0271, 0x0000],
  [9600,       0x4138, 0x0000],
  [19200,      0x809C, 0x0000],
  [38400,      0xC04E, 0x0000],
  [57600,      0x0034, 0x0000],
  [115200,     0x001A, 0x0000],
  [230400,     0x000D, 0x0000],
  [460800,     0x4006, 0x0000],
  [921600,     0x8003, 0x0000],
  [1_000_000,  0x0003, 0x0000],
];

describe('baudToDivisor', () => {
  it.each(vectors)(
    '%d baud → wValue=0x%s wIndex=0x%s',
    (baud, wValue, wIndex) => {
      expect(baudToDivisor(baud)).toEqual({ wValue, wIndex });
    },
  );
});
```

Run `npm test`. Most fail (only 115200 passes). **Commit:**

```
test(baud): expand to full ftdi_sio.c reference vector table
```

### Step 1.4 — Implement the canonical algorithm

Rewrite `src/baud.ts`:

```ts
export interface BaudDivisor {
  readonly wValue: number;
  readonly wIndex: number;
}

/**
 * Bits 14-16 of the encoded divisor encode the fractional part of the
 * divisor as a 3-bit code. The code is NOT the fractional part in
 * eighths; it's a permutation. This `divfrac` table maps the low 3
 * bits of the unscaled divisor (`divisor3 & 7`) to the 3-bit
 * fractional code.
 *
 * Taken verbatim from Linux kernel `drivers/usb/serial/ftdi_sio.c`,
 * `ftdi_232bm_baud_base_to_divisor()`.
 */
const DIVFRAC = [0, 3, 2, 4, 1, 5, 6, 7] as const;

const FT232BM_BASE_CLOCK = 48_000_000;

export function baudToDivisor(baud: number): BaudDivisor {
  // divisor3 is the BRG divisor scaled by 8, so it's an integer
  // that captures the fractional part in its low 3 bits.
  const divisor3 = Math.floor(FT232BM_BASE_CLOCK / 2 / baud);

  let divisor = (divisor3 >>> 3) | (DIVFRAC[divisor3 & 7] << 14);

  return {
    wValue: divisor & 0xFFFF,
    wIndex: (divisor >>> 16) & 0xFFFF,
  };
}
```

Run `npm test`. All vectors pass. **Commit:**

```
feat(baud): implement 232BM-family divisor algorithm

Use the canonical algorithm from Linux ftdi_sio.c. The 3-bit
fractional code is a permutation (DIVFRAC table), not eighths-of-an-
integer as some online references suggest.
```

### Step 1.5 — Failing tests for special cases (2 Mbaud, 3 Mbaud)

Add to the test file:

```ts
describe('baudToDivisor special cases', () => {
  it('returns wValue=0x0001 for 2 Mbaud (remapped from raw 0x4001)', () => {
    expect(baudToDivisor(2_000_000)).toEqual({ wValue: 0x0001, wIndex: 0x0000 });
  });

  it('returns wValue=0x0000 for 3 Mbaud (remapped from raw 0x0001)', () => {
    expect(baudToDivisor(3_000_000)).toEqual({ wValue: 0x0000, wIndex: 0x0000 });
  });
});
```

Run `npm test`. These fail because we haven't added the remapping yet.
**Commit:**

```
test(baud): add 2 Mbaud and 3 Mbaud special-case vectors
```

### Step 1.6 — Implement special-case remapping

Add to `baudToDivisor`:

```ts
  // Special remappings for the highest two reachable baud rates.
  if (divisor === 1) divisor = 0;             // 3 Mbaud
  else if (divisor === 0x4001) divisor = 1;   // 2 Mbaud
```

placed just before the return. Run `npm test`. Pass. **Commit:**

```
feat(baud): handle special-case remapping for 2 Mbaud and 3 Mbaud
```

### Step 1.7 — Failing tests for invalid inputs

Add:

```ts
describe('baudToDivisor input validation', () => {
  it.each([0, -1, -115200])('throws RangeError for non-positive baud %d', (baud) => {
    expect(() => baudToDivisor(baud)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -Infinity])('throws RangeError for non-finite baud %s', (baud) => {
    expect(() => baudToDivisor(baud)).toThrow(RangeError);
  });

  it('throws RangeError for baud above 3 Mbaud (unreachable)', () => {
    expect(() => baudToDivisor(4_000_000)).toThrow(RangeError);
  });

  it('truncates fractional baud input without throwing', () => {
    expect(baudToDivisor(115200.7)).toEqual(baudToDivisor(115200));
  });
});
```

Run `npm test`. These fail. **Commit:**

```
test(baud): cover invalid and edge-case baud inputs
```

### Step 1.8 — Add validation

```ts
export function baudToDivisor(baud: number): BaudDivisor {
  if (!Number.isFinite(baud)) {
    throw new RangeError(`baud must be a finite number: ${baud}`);
  }
  if (baud <= 0) {
    throw new RangeError(`baud must be positive: ${baud}`);
  }

  const divisor3 = Math.floor(FT232BM_BASE_CLOCK / 2 / baud);
  if (divisor3 === 0) {
    throw new RangeError(`baud too high (max 3_000_000): ${baud}`);
  }

  let divisor = (divisor3 >>> 3) | (DIVFRAC[divisor3 & 7] << 14);
  if (divisor === 1) divisor = 0;
  else if (divisor === 0x4001) divisor = 1;

  return {
    wValue: divisor & 0xFFFF,
    wIndex: (divisor >>> 16) & 0xFFFF,
  };
}
```

Run `npm test`. All pass. **Commit:**

```
feat(baud): validate input and reject unreachable bauds
```

### Step 1.9 — Refactor: extract a verifier and write the regenerator

Two cleanups, separate commits:

(a) Pull the algorithm body into an internal helper so the public function
just handles validation:

```ts
function rawDivisor(baud: number): number {
  const divisor3 = Math.floor(FT232BM_BASE_CLOCK / 2 / baud);
  let d = (divisor3 >>> 3) | (DIVFRAC[divisor3 & 7] << 14);
  if (d === 1) d = 0;
  else if (d === 0x4001) d = 1;
  return d;
}
```

Run tests. Pass. **Commit:**

```
refactor(baud): extract rawDivisor helper
```

(b) Write `scripts/gen-baud-vectors.mjs` that prints the same table found
in `BAUD-VECTORS.md`. The script is referenced from `BAUD-VECTORS.md` as
the regeneration tool. If we ever change the algorithm, we run the script
and diff the output against the markdown.

```js
#!/usr/bin/env node
import { baudToDivisor } from '../dist/baud.js';

const BAUDS = [300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600,
               115200, 230400, 460800, 921600, 1_000_000, 2_000_000, 3_000_000];

console.log('| Baud | wValue | wIndex | Effective baud | Error % |');
console.log('|------|--------|--------|----------------|---------|');
for (const baud of BAUDS) {
  const { wValue, wIndex } = baudToDivisor(baud);
  // ... compute effective baud, print row
}
```

Run it with `npm run build && node scripts/gen-baud-vectors.mjs`. Confirm
output matches the table. **Commit:**

```
chore(baud): add regenerator script for vector table
```

## Acceptance checklist

- [ ] `npm test` passes (all baud-related tests green)
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` produces `dist/baud.js` and `dist/baud.d.ts`
- [ ] `node scripts/gen-baud-vectors.mjs` output matches `docs/BAUD-VECTORS.md`
- [ ] Branch merged into `main` with `--no-ff`
- [ ] Update `PLAN.md` if any deviation from the plan was needed
