# Hardware-in-loop tests

These tests run against a real FT231XS chip. They are excluded from `npm test`.

## Setup

1. Plug in an FT231XS-based board (e.g. ULX3S).
2. (Linux) Unbind the kernel driver so libusb can claim the device:
   ```
   ftdi-unbind 0403:6015
   ```
   See `docs/phases/PHASE-09-hw-tests.md` for the udev rule alternative.
3. Short the TX and RX pins on the FT231XS for loopback tests.

## Preflight

`npm run test:hw` automatically runs `hil-preflight/preflight.sh` first.
The preflight verifies both the Pico CDC rig and the FTDI loopback plug before
Vitest starts. If either device is missing the run exits immediately with a clear
hardware error.

`hil-preflight/` is a sibling directory in this repo (resolved at
`../hil-preflight/` from this component), so no separate checkout is
needed.

## Running

```bash
npm run test:hw
```

If the device isn't found the suite exits with a clear error. If tests fail, check:

- Is another process holding the device? (Kill any open serial terminals, rebind with `ftdi-bind 0403:6015` then `ftdi-unbind 0403:6015`.)
- Is `ftdi_sio` still bound? (`ls /sys/bus/usb/drivers/ftdi_sio/`)
- Is the loopback jumper in place? (TX pin → RX pin)

## Modem truth-table test

Requires RTS→CTS **and** DTR→DSR wired as loopback jumpers. Run with:

```bash
FTDI_HW_TEST=1 FTDI_HW_MODEM=1 npm run test:hw
```

The four rows of the truth table check that each combination of DTR/RTS
is reflected back in the DSR/CTS status bits. If the wiring is confirmed
correct and a row fails, the bug is in the driver's `encodeModemControl`
or `getModemStatus` implementation.
