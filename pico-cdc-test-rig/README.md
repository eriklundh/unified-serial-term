# pico-cdc-test-rig

Firmware for a Raspberry Pi Pico that enumerates as a **USB CDC-ACM serial port** and echoes every byte back to the sender. It is the known-good Web Serial test device for the `terminal-app` project — the CDC counterpart to the FT231X dongle that tests the WebUSB backend.

## Behavior contract

| Input from host | Device response |
|-----------------|-----------------|
| Any bytes | Echoed back unchanged (loopback) |
| `0x01 0x3F` (sentinel) | `RIG baud=N data=N parity=X stop=X dtr=N rts=N\n` |

The device captures whatever line coding (`baudRate`, `dataBits`, `parity`, `stopBits`) and line state (DTR, RTS) the host sets. Sending the sentinel retrieves the current values as a one-line text report — this lets the terminal-app's Web Serial backend tests assert that `open()` parameters reached the device correctly.

The onboard LED mirrors DTR: on when DTR is asserted, off when released.

No external wiring needed. The loopback is in firmware; plug USB and it works.

## Quick start — flash the prebuilt UF2

1. Download `pico-cdc-test-rig.uf2` from the [latest release](../../releases/latest).
2. Hold **BOOTSEL** on the Pico and plug it in. The drive `RPI-RP2` appears.
3. Copy the UF2 onto it:
   ```bash
   cp pico-cdc-test-rig.uf2 /media/$USER/RPI-RP2/
   ```
4. The Pico reboots and enumerates as `Pico CDC Test Rig` (VID `2e8a`, PID `000a`).
5. Verify with the harness (requires Python 3 + pyserial):
   ```bash
   pip install pyserial
   ./harness/run.sh
   ```

After the first flash, all subsequent flashes need no button press — see [Flashing](#flashing).

## Harness

```
harness/
  loopback_test.py    — sends 5 payloads, asserts byte-for-byte echo
  settings_test.py    — opens with 6 line-coding combos, reads sentinel report
  run.sh              — runs both; exits non-zero on first failure
```

Auto-detects `/dev/ttyACM*`. Pass `--port /dev/ttyACM0` to override.

```bash
./harness/run.sh                        # auto-detect
./harness/run.sh /dev/ttyACM0          # explicit port
```

See `harness/README.md` for details and terminal-app integration notes.

## Building from source

**Prerequisites** (Debian 13 / RPi OS Trixie — see `docs/DEV-ENVIRONMENT.md`):
```bash
sudo apt install -y cmake ninja-build build-essential \
    gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib \
    git picotool
git clone --branch 2.2.0 https://github.com/raspberrypi/pico-sdk.git ~/pico-sdk
cd ~/pico-sdk && git submodule update --init
export PICO_SDK_PATH=$HOME/pico-sdk
```

**Build:**
```bash
git clone https://github.com/eriklundh/pico-cdc-test-rig.git
cd pico-cdc-test-rig
cmake -B build -G Ninja -DPICO_BOARD=pico
cmake --build build
```

Produces `build/pico-cdc-test-rig.uf2`.

**Host unit tests** (ring buffer + report formatter, no Pico needed):
```bash
make -C test
```

## Flashing

### First flash — BOOTSEL required once

Hold BOOTSEL, plug in, copy the UF2, or:
```bash
picotool load -x build/pico-cdc-test-rig.uf2
```

### All subsequent flashes — no button needed

The firmware exposes the picotool reset interface. Once it is running, flash directly:
```bash
cmake --build build
picotool load -f -x build/pico-cdc-test-rig.uf2
```

picotool reboots the running device to BOOTSEL, flashes, and relaunches — no human at the board.

See `docs/FLASHING.md` for drag-drop, picotool, and SWD options.

## Board support

Default target is the original Pico (RP2040). Override `PICO_BOARD` at configure time:

```bash
cmake -B build -G Ninja -DPICO_BOARD=pico      # RP2040 (default)
cmake -B build -G Ninja -DPICO_BOARD=pico2     # RP2350
cmake -B build -G Ninja -DPICO_BOARD=pico_w    # RP2040 + wireless
cmake -B build -G Ninja -DPICO_BOARD=pico2_w   # RP2350 + wireless
```

The loopback firmware is board-agnostic; only the LED behavior varies.

## USB identity

| Field | Value |
|-------|-------|
| Vendor ID | `0x2E8A` (Raspberry Pi) |
| Product ID | `0x000A` (Pico SDK CDC RP2040) |
| Product string | `Pico CDC Test Rig` |
| Linux device | `/dev/ttyACM*` |
| macOS device | `/dev/cu.usbmodem*` |
| Windows | COM port (no driver install needed — CDC is built into Windows) |

## Project layout

```
src/
  main.c              — main loop: tud_task() + CDC service
  tusb_config.h       — TinyUSB configuration (CDC enabled)
  usb_descriptors.c   — device / config / string descriptors
  usb_reset.c         — picotool reset interface driver
  ring_buffer.{h,c}   — RX→TX ring buffer (host unit-tested)
  report.{h,c}        — line-coding report formatter (host unit-tested)
test/
  test_ring_buffer.c  — 8 ring-buffer unit tests
  test_report.c       — 7 report-formatter unit tests
  Makefile
harness/
  loopback_test.py
  settings_test.py
  run.sh
  README.md
docs/
  DEV-ENVIRONMENT.md  — toolchain setup
  USB-CDC.md          — TinyUSB CDC reference
  FLASHING.md         — UF2 / picotool / SWD
release/
  pico-cdc-test-rig.uf2  — prebuilt firmware (RP2040 / Pico)
```

## Relationship to the other repos

| Repo | Role | Tests |
|------|------|-------|
| `ftdi-webusb-driver` | TypeScript WebUSB driver | — |
| `terminal-app` | Browser terminal, dual backend | both backends |
| **`pico-cdc-test-rig`** | **CDC loopback firmware** | **Web Serial backend** |

Flash this firmware onto a Pico and plug it into the test machine. The terminal-app's Web Serial smoke tests talk to it through `navigator.serial`, exactly as a real user would.

## License

MIT — see `LICENSE`.
