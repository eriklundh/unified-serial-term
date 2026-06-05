# PHASE-04-status-strip.md — Bulk-IN status header stripping

Branch: `phase/04-status-strip`

## Goal

A pure function that takes a raw bulk-IN packet from the chip and returns
the modem-status byte, line-status byte, and the payload (everything after
the first two bytes).

```ts
interface ModemStatusFlags {
  readonly cts: boolean;
  readonly dsr: boolean;
  readonly ri: boolean;
  readonly rlsd: boolean;  // RLSD / DCD
  readonly raw: number;
}

interface LineStatusFlags {
  readonly overrunError: boolean;
  readonly parityError: boolean;
  readonly framingError: boolean;
  readonly breakInterrupt: boolean;
  readonly transmitHoldingRegisterEmpty: boolean;
  readonly transmitterEmpty: boolean;
  readonly fifoError: boolean;
  readonly raw: number;
}

interface StrippedPacket {
  readonly modemStatus: ModemStatusFlags;
  readonly lineStatus: LineStatusFlags;
  readonly payload: Uint8Array;  // empty if the packet was idle (length 2)
}

function stripStatus(packet: Uint8Array): StrippedPacket;
```

## Why this matters

**Every** bulk-IN packet from the chip starts with 2 status bytes,
regardless of whether the UART has anything to send. With a 16ms latency
timer and no UART input, the chip still sends a packet every 16ms
containing just `[status0, status1]`. With UART input, you get
`[status0, status1, ...payload]` up to the 64-byte max packet size.

If you forget to strip these, your "received data" includes spurious
status bytes interleaved every 62 bytes. That's the bug that, in the
prior-art code, would have caused garbled output even if the rest of
the setup were correct.

## Byte layout

### Status byte 0 — modem status

| Bit | Flag  | Meaning                          |
|-----|-------|----------------------------------|
| 0   | —     | reserved (always 1 on FT-X)      |
| 1-3 | —     | reserved                         |
| 4   | CTS   | Clear To Send                    |
| 5   | DSR   | Data Set Ready                   |
| 6   | RI    | Ring Indicator                   |
| 7   | RLSD  | Receive Line Signal Detect (DCD) |

### Status byte 1 — line status

| Bit | Flag             | Meaning                              |
|-----|------------------|--------------------------------------|
| 0   | —                | reserved                             |
| 1   | OE               | Overrun error                        |
| 2   | PE               | Parity error                         |
| 3   | FE               | Framing error                        |
| 4   | BI               | Break interrupt                      |
| 5   | THRE             | Transmit holding register empty      |
| 6   | TEMT             | Transmitter empty                    |
| 7   | RCV_FIFO_ERR     | FIFO error                           |

## TDD walkthrough

### Step 4.1 — Idle packet

```ts
import { describe, it, expect } from 'vitest';
import { stripStatus } from './read.js';

describe('stripStatus', () => {
  it('returns empty payload for idle packet (2 bytes only)', () => {
    const result = stripStatus(new Uint8Array([0x01, 0x60]));
    expect(result.payload).toEqual(new Uint8Array(0));
    expect(result.modemStatus.raw).toBe(0x01);
    expect(result.lineStatus.raw).toBe(0x60);
  });
});
```

Red → commit: `test(read): add idle-packet stripping test`

### Step 4.2 — Stub

```ts
export function stripStatus(packet: Uint8Array): StrippedPacket {
  return {
    modemStatus: { raw: packet[0], cts: false, dsr: false, ri: false, rlsd: false },
    lineStatus: {
      raw: packet[1],
      overrunError: false, parityError: false, framingError: false,
      breakInterrupt: false, transmitHoldingRegisterEmpty: false,
      transmitterEmpty: false, fifoError: false,
    },
    payload: packet.subarray(2),
  };
}
```

Green → commit: `feat(read): stub stripStatus returning raw bytes only`

### Step 4.3 — Test with payload

```ts
  it('returns payload for non-idle packet', () => {
    const data = new Uint8Array([0x01, 0x60, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    const result = stripStatus(data);
    expect(Array.from(result.payload)).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
  });
```

Green already (the stub does this). No commit needed — this is just adding
a regression test for the existing behaviour, so commit it as a
test-coverage addition:

`test(read): cover non-idle packet payload extraction`

### Step 4.4 — Status flag tests

```ts
describe('stripStatus modemStatus flags', () => {
  it('decodes CTS asserted', () => {
    const r = stripStatus(new Uint8Array([0x10, 0x00]));
    expect(r.modemStatus.cts).toBe(true);
    expect(r.modemStatus.dsr).toBe(false);
  });

  it('decodes RLSD/DCD asserted', () => {
    const r = stripStatus(new Uint8Array([0x80, 0x00]));
    expect(r.modemStatus.rlsd).toBe(true);
  });

  it('decodes all four modem flags asserted', () => {
    const r = stripStatus(new Uint8Array([0xF0, 0x00]));
    expect(r.modemStatus).toMatchObject({
      cts: true, dsr: true, ri: true, rlsd: true,
    });
  });
});

describe('stripStatus lineStatus flags', () => {
  it('decodes THRE asserted', () => {
    const r = stripStatus(new Uint8Array([0x00, 0x20]));
    expect(r.lineStatus.transmitHoldingRegisterEmpty).toBe(true);
  });

  it('decodes framing error', () => {
    const r = stripStatus(new Uint8Array([0x00, 0x08]));
    expect(r.lineStatus.framingError).toBe(true);
  });
});
```

Red → commit: `test(read): cover modem and line status bit decoding`

### Step 4.5 — Decode flags

```ts
function decodeModemStatus(byte: number): ModemStatusFlags {
  return {
    raw: byte,
    cts:  (byte & 0x10) !== 0,
    dsr:  (byte & 0x20) !== 0,
    ri:   (byte & 0x40) !== 0,
    rlsd: (byte & 0x80) !== 0,
  };
}

function decodeLineStatus(byte: number): LineStatusFlags {
  return {
    raw: byte,
    overrunError:                 (byte & 0x02) !== 0,
    parityError:                  (byte & 0x04) !== 0,
    framingError:                 (byte & 0x08) !== 0,
    breakInterrupt:               (byte & 0x10) !== 0,
    transmitHoldingRegisterEmpty: (byte & 0x20) !== 0,
    transmitterEmpty:             (byte & 0x40) !== 0,
    fifoError:                    (byte & 0x80) !== 0,
  };
}

export function stripStatus(packet: Uint8Array): StrippedPacket {
  if (packet.length < 2) {
    throw new RangeError(`bulk-IN packet too short (${packet.length} bytes), need ≥ 2`);
  }
  return {
    modemStatus: decodeModemStatus(packet[0]!),
    lineStatus:  decodeLineStatus(packet[1]!),
    payload:     packet.subarray(2),
  };
}
```

Green → commit: `feat(read): decode modem and line status bits`

### Step 4.6 — Short-packet test

```ts
  it('throws RangeError for packets shorter than 2 bytes', () => {
    expect(() => stripStatus(new Uint8Array(0))).toThrow(RangeError);
    expect(() => stripStatus(new Uint8Array([0x01]))).toThrow(RangeError);
  });
```

Already green from the validation added in 4.5. Commit:
`test(read): assert short packets throw RangeError`

### Step 4.7 — Refactor

The flag-decoding tables (mask + name) could live in named constants /
enums. Lift them:

```ts
export const ModemStatusBits = {
  CTS:  0x10,
  DSR:  0x20,
  RI:   0x40,
  RLSD: 0x80,
} as const;

export const LineStatusBits = {
  OVERRUN_ERROR:                    0x02,
  PARITY_ERROR:                     0x04,
  FRAMING_ERROR:                    0x08,
  BREAK_INTERRUPT:                  0x10,
  TRANSMIT_HOLDING_REGISTER_EMPTY:  0x20,
  TRANSMITTER_EMPTY:                0x40,
  FIFO_ERROR:                       0x80,
} as const;
```

Re-run tests. Commit: `refactor(read): hoist status bit masks as named constants`

## Acceptance checklist

- [ ] All status-bit decoding paths tested
- [ ] Idle and short-packet edge cases tested
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all clean
- [ ] Branch merged
