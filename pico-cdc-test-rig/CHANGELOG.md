# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [semantic versioning](https://semver.org/).

---

## [0.1.0] — 2026-06-01

### Added

- **USB CDC-ACM enumeration** (VID `0x2E8A`, PID `0x000A`, product string
  "Pico CDC Test Rig"). The device binds via the OS's built-in CDC driver
  and appears as `/dev/ttyACM*` (Linux), a COM port (Windows), or
  `/dev/cu.usbmodem*` (macOS).

- **Byte loopback** — every byte the host writes is echoed back unchanged.
  A 256-byte ring buffer absorbs RX/TX rate mismatches without dropping bytes.

- **Line-coding and line-state capture** — `tud_cdc_line_coding_cb` and
  `tud_cdc_line_state_cb` store the baud rate, data bits, parity, stop bits,
  DTR, and RTS that the host sets via `SET_LINE_CODING` / `SET_CONTROL_LINE_STATE`.

- **Sentinel report** — sending the two-byte sequence `0x01 0x3F` causes
  the device to reply with:
  ```
  RIG baud=N data=N parity=X stop=X dtr=N rts=N
  ```
  instead of echoing those bytes. Everything else echoes normally.

- **DTR → LED** — the onboard LED mirrors the DTR line state as a visual aid.

- **picotool reset interface** — a zero-endpoint vendor interface
  (class `0xFF`, subclass `0x00`, protocol `0x01`) lets picotool reboot the
  running firmware to BOOTSEL mode without pressing the button:
  ```bash
  picotool load -f -x build/pico-cdc-test-rig.uf2
  ```

- **Host unit tests** — 8 ring-buffer tests and 7 report-formatter tests
  compile and run on the host (no Pico needed). Run with `make -C test`.

- **Host harness** — `harness/run.sh` drives `loopback_test.py` and
  `settings_test.py` via pyserial. Exits non-zero with a clear error on
  failure.

- **Prebuilt UF2** in `release/pico-cdc-test-rig.uf2` (RP2040 / Pico).

### Technical details

- Built with Raspberry Pi Pico C/C++ SDK 2.2.0 and TinyUSB (SDK submodule).
- Targets RP2040 (`PICO_BOARD=pico`) by default; RP2350 and W variants
  supported via the `PICO_BOARD` CMake variable.
- `CFG_TUSB_RHPORT0_MODE` must be defined (SDK 2.2.0 / TinyUSB 0.16+
  requires it when calling `tusb_init()` with no arguments).
