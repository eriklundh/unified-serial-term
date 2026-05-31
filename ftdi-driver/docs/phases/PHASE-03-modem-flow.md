# PHASE-03-modem-flow.md — Modem and flow control encoders

Branch: `phase/03-modem-flow`

## Goals

Two pure functions:

```ts
function encodeModemControl(opts: { dtr?: boolean; rts?: boolean }):
  { wValue: number };

type FlowMode = 'none' | 'rtscts' | 'dtrdsr' | 'xonxoff';

function encodeFlowControl(
  mode: FlowMode,
  opts?: { xonChar?: number; xoffChar?: number },
): { wValue: number; wIndex: number };
```

## Modem control (`SIO_MODEM_CTRL`, request `0x01`)

The chip stores DTR and RTS independently. The control transfer carries:
- **State bits** in the low byte: which line should be high
- **Change-mask bits** in the high byte: which lines actually change

So to set DTR high without touching RTS: `wValue = 0x0101` (mask=DTR, state=DTR-high).
To set DTR low without touching RTS: `wValue = 0x0100` (mask=DTR, state=DTR-low).
To set both DTR and RTS high in one call: `wValue = 0x0303`.

Where:
- DTR mask = `0x01 << 8` = `0x0100`
- RTS mask = `0x02 << 8` = `0x0200`
- DTR state = `0x01`
- RTS state = `0x02`

### Test vectors

| Input                        | wValue   |
|------------------------------|----------|
| `{ dtr: true }`              | `0x0101` |
| `{ dtr: false }`             | `0x0100` |
| `{ rts: true }`              | `0x0202` |
| `{ rts: false }`             | `0x0200` |
| `{ dtr: true, rts: true }`   | `0x0303` |
| `{ dtr: false, rts: false }` | `0x0300` |
| `{ dtr: true, rts: false }`  | `0x0301` |
| `{}`                         | `0x0000` (no change-mask = no-op) |

## Flow control (`SIO_SET_FLOW_CTRL`, request `0x02`)

This is the one most prior-art code got tangled on. **The mode lives in
the high byte of `wIndex`, not `wValue`.**

Per `ftdi_sio.c`:

```c
priv->index = ((flow << 8) | priv->channel);
```

where `flow` is the flow control bitmask:
- `0x00` = none
- `0x01` = RTS/CTS
- `0x02` = DTR/DSR
- `0x04` = XON/XOFF

For FT231XS, `channel = 0`, so:
- None mode: `wIndex = 0x0000`
- RTS/CTS:   `wIndex = 0x0100`
- DTR/DSR:   `wIndex = 0x0200`
- XON/XOFF:  `wIndex = 0x0400`

`wValue` carries the XON char in its low byte and XOFF char in its high
byte when (and only when) using XON/XOFF mode. For other modes, both
bytes are 0. Defaults: XON=`0x11`, XOFF=`0x13` (DC1/DC3).

### Test vectors

| mode      | opts                              | wValue   | wIndex   |
|-----------|-----------------------------------|----------|----------|
| `none`    | —                                 | `0x0000` | `0x0000` |
| `rtscts`  | —                                 | `0x0000` | `0x0100` |
| `dtrdsr`  | —                                 | `0x0000` | `0x0200` |
| `xonxoff` | (defaults)                        | `0x1311` | `0x0400` |
| `xonxoff` | `{ xonChar: 0x11, xoffChar: 0x13 }`| `0x1311` | `0x0400` |
| `xonxoff` | `{ xonChar: 0x05, xoffChar: 0x06 }`| `0x0605` | `0x0400` |

Note the little-endian byte order in `wValue`: low byte is XON, high
byte is XOFF.

## TDD walkthrough

Same pattern as Phase 1 and 2:

1. `test(modem): add failing tests for DTR/RTS encoding vectors` (red)
2. `feat(modem): implement encodeModemControl` (green)
3. `test(modem): cover empty-options no-op case` (red)
4. `feat(modem): handle empty options as zero change-mask` (green)
5. `refactor(modem): extract MODEM_BITS constants` (refactor)
6. `test(flow): add failing tests for all four flow modes` (red)
7. `feat(flow): implement encodeFlowControl` (green)
8. `test(flow): cover XON/XOFF char overrides` (red)
9. `feat(flow): wire xonChar/xoffChar into wValue` (green)
10. `test(flow): cover invalid flow mode` (red)
11. `feat(flow): validate flow mode` (green)

## Acceptance checklist

- [ ] All vectors above are tested and pass
- [ ] Invalid inputs throw `RangeError` with descriptive messages
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all clean
- [ ] Branch merged
