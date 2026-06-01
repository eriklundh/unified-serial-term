# ftdi-loopback-verify

An **independent** verification suite for the FT231X loopback test rig,
written in Python with **pyFTDI**.

## Why independent

The `ftdi-webusb-driver` (TypeScript) has its own Phase 9 hardware
tests. This suite is deliberately *separate*: a different language, a
different library (pyFTDI, maintained by a different author), talking to
the same chip the same way (libusb/WinUSB, vendor control transfers) but
sharing no code with the driver under test.

That independence is the value. Two failure modes it catches that the
driver's own tests can't:

1. **Bad wiring masquerading as correct.** If you mis-soldered a bridge,
   the driver's own test might pass or fail in a confusing way. An
   independent tool gives a second opinion grounded in different code.
2. **A shared-assumption bug.** If the driver and its tests both encode
   the same wrong assumption about the protocol, they'd agree with each
   other and still be wrong. pyFTDI was written independently from your
   driver, so if both agree on what the loopback does, the protocol
   understanding is cross-validated, not just internally consistent.

This suite decodes the raw modem-status bytes itself (using FTDI's
documented bit masks) rather than trusting pyFTDI's decoded properties —
so it's independent even of pyFTDI's own interpretation layer.

## Expected wiring

Solder these on the FT231X dongle (see the driver repo's
`PHASE-09-hw-tests.md` → "Hardware test topology"):

```
TX  -> RX     data loopback
RTS -> CTS    \  RTS drives both
RTS -> DCD    /  CTS and DCD
DTR -> DSR    \  DTR drives both
DTR -> RI     /  DSR and RI
```

So: **CTS and DCD follow RTS; DSR and RI follow DTR.** Direct pin-to-pin
jumpers preserve the active-low convention on both ends, so the logic
holds whether the dongle exposes raw TTL pins or RS-232 levels.

## Install

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

pyFTDI needs libusb. On Debian/Ubuntu: `sudo apt install libusb-1.0-0`.
On macOS: `brew install libusb`. On Windows it comes via the WinUSB
binding (below).

## Device binding (same requirement as the driver)

pyFTDI, like your WebUSB driver, bypasses the OS serial (VCP) driver and
claims the device through libusb/WinUSB. The chip must be bound
accordingly:

- **Linux:** unbind the kernel's `ftdi_sio` from this device, or add a
  udev rule so your user can claim it:
  ```bash
  # Unbind a specific device (find the path in `lsusb -t`):
  echo -n "1-1.4:1.0" | sudo tee /sys/bus/usb/drivers/ftdi_sio/unbind
  # Or a udev rule granting access:
  echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6015", MODE="0666"' \
      | sudo tee /etc/udev/rules.d/99-ftdi-test.rules
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```
- **Windows:** bind the device to WinUSB with [Zadig](https://zadig.akeo.ie/) —
  the same step the lab/classroom workflow uses.

**One device, one claimer at a time.** You can't run this suite while a
browser WebUSB session (or the driver's own hardware test) is holding
the device. Run them sequentially — the point is that they *independently
agree*, not that they run at once.

## Running

First, find your device's URL if the default doesn't match:

```bash
python list_devices.py
```

As a standalone wiring diagnostic (best right after soldering — gives a
human-readable per-bridge report):

```bash
python verify_wiring.py
# or point at a specific device:
python verify_wiring.py 'ftdi://0x403:0x6015/1'
```

As a pytest suite (best for CI / repeatable checks):

```bash
pytest -v
```

`pytest` collects two files: `test_data_loopback.py` (TX↔RX) and
`test_modem_loopback.py` (the four-row modem truth table). Both share
the device fixture in `conftest.py`, which skips cleanly if no rig is
attached.

Point at a specific device with the `FTDI_URL` environment variable
(honored by both the standalone and pytest paths):

```bash
FTDI_URL='ftdi://0x403:0x6015/1' pytest -v
FTDI_URL='ftdi://0x403:0x6015:FT9ABCDE/1' python verify_wiring.py   # by serial
```

If no device is found, `verify_wiring.py` prints binding guidance and
exits non-zero; the pytest suite skips with the same hint.

## Reading the output

Standalone mode prints three sections:

1. **Data loopback** — several payload sizes echoed through TX→RX.
   A failure here points at the TX↔RX jumper.
2. **Modem truth table** — the four RTS/DTR combinations with the
   resulting CTS/DCD/DSR/RI, flagging any mismatch.
3. **Per-bridge diagnosis** — drives one output at a time and checks
   that exactly the right inputs follow *and* the other pair stays quiet.
   This pinpoints a single faulty bridge (or a solder short between
   adjacent pins) by name, e.g. `[FAIL] RTS->DCD bridge`.

The per-bridge section is the one to read when something's wrong: it
tells you which solder joint to inspect rather than just "a modem test
failed."

## The truth table this verifies

| RTS | DTR | CTS | DCD | DSR | RI |
|-----|-----|-----|-----|-----|----|
| 0 | 0 | 0 | 0 | 0 | 0 |
| 1 | 0 | 1 | 1 | 0 | 0 |
| 0 | 1 | 0 | 0 | 1 | 1 |
| 1 | 1 | 1 | 1 | 1 | 1 |

Setting an output asserted should make exactly its two wired inputs read
asserted, and leave the other two clear.

## Relationship to the driver's Phase 9

Complementary, not a replacement:

- **This suite** proves the *wiring* is correct and gives an independent
  reading of the *protocol* via pyFTDI.
- **The driver's Phase 9** proves *your driver's* implementation drives
  that same wiring correctly.

Run this first after soldering to confirm the rig itself is sound. Then
run the driver's Phase 9 against the verified rig — if Phase 9 then
fails, the fault is in the driver, not the hardware, because this suite
already cleared the wiring. That ordering turns an ambiguous "something's
wrong with the hardware test" into a precise "the driver's modem
encoding is wrong," which is exactly the fault isolation you want.
