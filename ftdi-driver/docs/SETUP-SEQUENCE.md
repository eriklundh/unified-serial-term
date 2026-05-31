# SETUP-SEQUENCE.md — verified FTDI configuration sequence

This is the **exact** sequence of vendor control transfers our driver
must issue when configuring an FT231XS for serial use. It is derived
from:
1. The user's USBPcap capture of the official FTDI Windows driver
   (captured with Cynthion + Packetry against a ULX3S board).
2. Cross-checked against `drivers/usb/serial/ftdi_sio.c` (Linux).
3. Cross-checked against libftdi `ftdi_usb_open_dev()` and `ftdi_set_*()`.

The official Windows driver does a fair bit of redundant work (multiple
modem-status reads, multiple modem-control toggles). The minimal-correct
sequence below preserves what actually matters and drops the noise. The
chip works reliably with this sequence.

## Mandatory sequence (in order)

| Step | Request                  | bRequest | wValue example       | wIndex   | Direction | Notes |
|------|--------------------------|----------|----------------------|----------|-----------|-------|
| 1    | `SIO_RESET`              | `0x00`   | `0x0000` (reset SIO) | `0x0000` | OUT       | Resets the chip state; do this first, always. |
| 2    | `SIO_SET_DATA`           | `0x04`   | encoded line props   | `0x0000` | OUT       | e.g. `0x0008` for 8N1 |
| 3    | `SIO_MODEM_CTRL`         | `0x01`   | `0x0101` (DTR high)  | `0x0000` | OUT       | Assert DTR if `opts.dtr !== false` |
| 4    | `SIO_MODEM_CTRL`         | `0x01`   | `0x0202` (RTS high)  | `0x0000` | OUT       | Assert RTS if `opts.rts !== false` |
| 5    | `SIO_SET_FLOW_CTRL`      | `0x02`   | depends on flow mode | flow type| OUT       | See `PROTOCOL.md` |
| 6    | `SIO_SET_BAUD_RATE`      | `0x03`   | divisor low 16       | divisor high 16 | OUT | From `baudToDivisor()` |
| 7    | `SIO_SET_LATENCY_TIMER`  | `0x09`   | latency ms (1-255)   | `0x0000` | OUT       | Default 16; lab default 4 |
| 8    | `SIO_GET_MODEM_STATUS`   | `0x05`   | `0x0000`             | `0x0000` | IN, len 2 | Sanity check; discard payload |

**Order matters.** In particular:
- Reset before anything else.
- Data format before baud rate (the FTDI Windows driver does this; we
  follow suit because it gives the chip a known stop-bit/parity state
  when the new clock starts).
- Modem control before flow control (asserting DTR/RTS gives the
  attached device a stable line state before we tell the chip what to
  do with CTS/DSR).
- Latency timer after baud (latency affects bulk-IN coalescing, which
  is irrelevant until data is flowing).

## What the official Windows driver does that we DON'T need to replicate

The full capture shows the driver also doing:
- A standard `CLEAR_FEATURE(ENDPOINT_HALT)` on `0x81` after reset.
  This is technically only needed if the endpoint is halted. After a
  fresh `SIO_RESET` it isn't. We skip it; if we see stalls in practice,
  add it as step 1.5.
- Two extra `SIO_MODEM_CTRL` calls and two extra `SIO_GET_MODEM_STATUS`
  calls interleaved with the above. These are vestigial driver
  behaviour, not protocol requirements. Skip.
- Reading the latency timer back after setting it. Skip.

## What the prior-art chats had wrong

The previous Python and JS code attempts:
- Issued `SIO_SET_BAUD_RATE` **before** `SIO_SET_DATA`, which is the
  reverse of what the official driver does. Both orders may work, but
  matching the driver removes one variable when debugging.
- Used the wrong endpoint number (`0x82` decimal-130 instead of `1`)
  for `transferIn` in the JS code.
- Encoded data bits as `(dataBits - 5)` (some pre-AN232BM datasheet
  formula), giving `0x03` for 8 data bits instead of `0x08`.
- Used `baseClock = 3_000_000` directly with `Math.round(divisor * 8) / 8`
  fractional quantisation. That doesn't match any FTDI chip's actual
  BRG. The 232BM family algorithm is `base / 2 / baud` followed by the
  `divfrac` permutation.

Don't replicate any of those mistakes. The TDD plan in `PLAN.md` is
structured to make each correct behaviour a tested assertion.
