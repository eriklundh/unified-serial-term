# BAUD-VECTORS.md — canonical baud-divisor test vectors

These vectors are derived directly from the Linux kernel
`drivers/usb/serial/ftdi_sio.c` function `ftdi_232bm_baud_base_to_divisor()`
with `base = 48_000_000`, which is the canonical reference implementation
for the FT232BM, FT232R, and FT-X (FT230X/FT231XS) families.

These are the **ground truth** for `Phase 1` TDD. They were verified by
running the kernel algorithm with `base = 48000000` for every listed baud
rate and computing the round-trip effective baud rate.

> **Important historical note.** The user's prior USB capture analysis
> (see `prior-art/`) interpreted a captured `wValue = 0x09C4` as a
> 115200 baud setup. **That was wrong.** `0x09C4 = 2500` decodes to a
> divisor of 2500 with frac-code 0, giving an effective baud of
> 48_000_000 / (16 × 2500) = **1200 baud**. The capture happened during
> a phase of the driver init that set 1200 baud, not the user's selected
> 115200. Don't replicate that misreading — write tests against the table
> below instead.

## The algorithm

```
function baudToDivisor(baud) {
  // divfrac maps the bottom 3 bits of the unscaled divisor (divisor3 & 7)
  // to the 3-bit fractional-divisor code in the encoded result.
  const divfrac = [0, 3, 2, 4, 1, 5, 6, 7];

  if (baud <= 0) throw new RangeError(`baud must be positive: ${baud}`);

  // The chip uses base / 16 as the UART clock; the BRG works in eighths.
  // divisor3 is the divisor scaled up by 8 (so it's an integer).
  const divisor3 = Math.floor(48_000_000 / 2 / baud);
  if (divisor3 === 0) throw new RangeError(`baud too high: ${baud}`);

  let divisor = (divisor3 >>> 3) | (divfrac[divisor3 & 7] << 14);

  // Special remappings for the highest two rates
  if (divisor === 1) divisor = 0;          // 3 Mbaud
  else if (divisor === 0x4001) divisor = 1;  // 2 Mbaud

  // The encoded divisor fits in 32 bits; low 16 → wValue, high 16 → wIndex.
  // For single-channel chips, the high bits are always 0 in practice.
  return {
    wValue: divisor & 0xFFFF,
    wIndex: (divisor >>> 16) & 0xFFFF,
  };
}
```

## Vectors

Every row was computed with `base = 48_000_000`. The "effective baud" is
what the chip will actually produce, and the "error %" is how far that is
from the requested baud. Errors under ~2% are within the tolerance of
typical UART receivers.

| Requested baud | wValue   | wIndex   | Effective baud  | Error % |
|----------------|----------|----------|-----------------|---------|
|            300 | `0x2710` | `0x0000` |          300.00 |   0.00  |
|            600 | `0x1388` | `0x0000` |          600.00 |   0.00  |
|           1200 | `0x09C4` | `0x0000` |         1200.00 |   0.00  |
|           2400 | `0x04E2` | `0x0000` |         2400.00 |   0.00  |
|           4800 | `0x0271` | `0x0000` |         4800.00 |   0.00  |
|           9600 | `0x4138` | `0x0000` |         9600.00 |   0.00  |
|          14400 | `0x4138` | `0x0000` |         9600.00 |  33.33  |  ⚠
|          19200 | `0x809C` | `0x0000` |        19200.00 |   0.00  |
|          38400 | `0xC04E` | `0x0000` |        38400.00 |   0.00  |
|          57600 | `0x0034` | `0x0000` |        57692.31 |   0.16  |
|         115200 | `0x001A` | `0x0000` |       115384.62 |   0.16  |
|         230400 | `0x000D` | `0x0000` |       230769.23 |   0.16  |
|         460800 | `0x4006` | `0x0000` |       461538.46 |   0.16  |
|         921600 | `0x8003` | `0x0000` |       923076.92 |   0.16  |
|       1_000_000| `0x0003` | `0x0000` |      1000000.00 |   0.00  |
|       2_000_000| `0x0001` | `0x0000` |      2000000.00 |   0.00  |
|       3_000_000| `0x0000` | `0x0000` |      3000000.00 |   0.00  |

⚠ 14400 isn't reachable with acceptable error on this chip. The kernel
algorithm just returns its best guess, which is the same as 9600. Tests
should either skip 14400 or accept that the function returns 9600's
encoding. Recommended behaviour: emit a console warning when the error
exceeds 3%.

## Edge cases for tests

| Input        | Expected behaviour                                      |
|--------------|---------------------------------------------------------|
| `0`          | throws `RangeError("baud must be positive: 0")`         |
| `-1`         | throws `RangeError("baud must be positive: -1")`        |
| `4_000_000`  | throws `RangeError("baud too high: 4000000")` (divisor3=0)|
| `NaN`        | throws `RangeError("baud must be a finite number: NaN")`|
| `Infinity`   | throws `RangeError`                                     |
| `1.5`        | round-down OK, but warn or throw — pick one and test for it |

For the `1.5` case: recommend **accepting floats and truncating internally
without warning**, since `Math.floor` in the algorithm already handles
fractional inputs gracefully. Test it: `baudToDivisor(115200.7)` should
return the same as `baudToDivisor(115200)`.

## How to regenerate this table

The Python in `scripts/gen-baud-vectors.py` (write this in Phase 1)
regenerates the vectors. If we ever question a value, run that script;
do not eyeball it.
