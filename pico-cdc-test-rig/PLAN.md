# PLAN.md — pico-cdc-test-rig

A phased plan for the Pico CDC loopback test rig. Test-first where the
target allows (pure logic on the host, integration via a host harness
written before the firmware behavior it checks).

## Acceptance criteria for "phase complete"

1. Firmware builds clean: `cmake` configure + build produces a `.uf2`
   with no warnings treated as errors.
2. Host-logic unit tests pass (where the phase has any).
3. The phase's hardware-in-loop check passes on a real flashed Pico
   (where the phase has one).
4. Phase doc / PLAN.md updated with any deviation.
5. Branch merged into `main` with `--no-ff`.

Phases 0–1 can be done by Claude Code on <build-host> for the build parts;
the flash-and-verify steps need a Pico attached (see CLAUDE.md's
build-vs-flash split).

---

## Phase 0 — Dev environment and blink

Branch: `phase/00-devenv-blink`

**Goal:** A working toolchain and a CMake project that builds a `.uf2`,
proven by blinking the onboard LED. This validates the entire
build→flash→run chain before any USB complexity.

See `docs/DEV-ENVIRONMENT.md` for the full toolchain install.

Steps:

1. Install the toolchain (Debian 13 / RPi OS 13 trixie):
   ```bash
   sudo apt update
   sudo apt install -y cmake python3 build-essential ninja-build \
       gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib \
       git
   ```
2. Clone the SDK at the pinned tag, with submodules (TinyUSB lives in a
   submodule — USB work fails without it):
   ```bash
   git clone --branch 2.2.0 https://github.com/raspberrypi/pico-sdk.git ~/pico-sdk
   cd ~/pico-sdk && git submodule update --init
   echo 'export PICO_SDK_PATH=$HOME/pico-sdk' >> ~/.bashrc
   ```
3. Scaffold the repo: `CMakeLists.txt`, `pico_sdk_import.cmake` (copied
   from the SDK's `external/`), `src/main.c` blinking GP25.
4. Configure and build:
   ```bash
   cmake -B build -G Ninja -DPICO_BOARD=pico
   cmake --build build
   ```
   Confirm `build/pico-cdc-test-rig.uf2` exists.
5. Flash (needs the Pico): BOOTSEL + drag-drop the UF2, or
   `picotool load -x build/*.uf2`. See `docs/FLASHING.md`.
6. Confirm the LED blinks.

Commits:
- `chore(proj): scaffold CMake project against pico-sdk 2.2.0`
- `feat(proj): blink onboard LED to validate toolchain`
- `docs: record toolchain setup in DEV-ENVIRONMENT.md`

Acceptance:
- [ ] `cmake --build build` produces a `.uf2`
- [ ] Flashed Pico blinks
- [ ] `docs/DEV-ENVIRONMENT.md` reflects what actually worked on your
      Trixie machine (update it if the apt set differed)

---

## Phase 1 — USB CDC enumeration

Branch: `phase/01-cdc-enumerate`

**Goal:** The Pico enumerates as a CDC-ACM device. No echo yet — just a
clean enumeration that the host OS binds as a serial port.

See `docs/USB-CDC.md` for descriptor and TinyUSB config details.

Steps:

1. Add `tusb_config.h` enabling the CDC device class
   (`CFG_TUD_CDC = 1`).
2. Add `usb_descriptors.c`: device descriptor (pick a VID/PID — use a
   test VID like `0xCafe` from the TinyUSB examples, **not** a real
   vendor's), CDC configuration descriptor, string descriptors.
3. Link TinyUSB in `CMakeLists.txt` (`target_link_libraries(... tinyusb_device tinyusb_board)`).
4. `main.c`: call `tusb_init()`, loop on `tud_task()`.
5. Build, flash, verify enumeration:
   ```bash
   lsusb | grep -i cafe          # device present
   dmesg | tail                  # /dev/ttyACM0 (or ttyACMn) created
   ```

Commits:
- `feat(usb): add CDC device descriptors and tusb config`
- `feat(usb): init TinyUSB and run device task loop`
- `docs(usb): document the descriptor layout`

Acceptance:
- [ ] `lsusb` shows the device with the chosen VID/PID
- [ ] OS creates a `/dev/ttyACM*` (Linux) / COM port (Windows)
- [ ] No enumeration errors in `dmesg` / Device Manager

---

## Phase 2 — Byte loopback (the core function)

Branch: `phase/02-loopback`

**Goal:** Every byte the host writes comes back unchanged. This is the
rig's primary behavior — what proves the Web Serial backend's
read/write path.

Steps:

1. In the service loop (or `tud_cdc_rx_cb`), read available bytes with
   `tud_cdc_read()`, write them straight back with `tud_cdc_write()` +
   `tud_cdc_write_flush()`.
2. Handle the full-buffer case: if `tud_cdc_write_available()` is short,
   don't drop bytes — buffer or backpressure. A ring buffer between RX
   and TX is the clean approach (and its logic is host-unit-testable —
   see Phase 4).
3. Build, flash.
4. Manual smoke: `picocom /dev/ttyACM0` (or `screen`), type, see echo.

Commits:
- `test(loopback): host-unit-test the RX→TX ring buffer logic`
- `feat(loopback): ring buffer between CDC RX and TX`
- `feat(loopback): echo received bytes back to host`

Acceptance:
- [ ] Ring-buffer unit tests pass on the host
- [ ] Typed characters echo back over a terminal program
- [ ] No byte loss under a fast paste of several KB

---

## Phase 3 — Line coding and line state reporting

Branch: `phase/03-line-reporting`

**Goal:** Capture the connection settings the host sets, and report them
back on a sentinel command. This is what lets the terminal-app Web
Serial backend tests assert that `open({ baudRate, dataBits, parity,
stopBits })` actually reached the device.

Steps:

1. Implement `tud_cdc_line_coding_cb(itf, coding)`: store the host's
   bit_rate, data_bits, parity, stop_bits.
2. Implement `tud_cdc_line_state_cb(itf, dtr, rts)`: store DTR/RTS;
   optionally drive the LED (e.g. on when DTR asserted) as a visual aid.
3. Define a sentinel: when the host sends a specific byte sequence
   (e.g. `0x01` then `0x3F` — pick something unlikely in normal text),
   the device replies with a one-line text report of the current line
   coding and line state, instead of echoing it. Everything else still
   echoes.
4. The report formatter is pure logic → unit-test it test-first on the
   host (input: a line-coding struct; output: the report string).
5. Build, flash, verify with the host harness (Phase 4).

Commits:
- `test(report): unit-test the line-coding report formatter`
- `feat(linecoding): capture host line coding via TinyUSB callback`
- `feat(linecoding): capture DTR/RTS line state`
- `feat(report): reply with settings on sentinel sequence`
- `feat(report): mirror DTR to onboard LED as a visual aid`

Acceptance:
- [ ] Report-formatter unit tests pass
- [ ] Sending the sentinel returns the line coding the host set
- [ ] Changing baud/parity on the host changes the reported values
- [ ] DTR toggle is observable (LED and/or report)

---

## Phase 4 — Host-side verification harness

Branch: `phase/04-host-harness`

**Goal:** A reusable host-side test harness (Python 3 + pyserial) that
opens the Pico's port and asserts the rig behaves. This harness defines
acceptance for Phases 2–3 and is reused by the terminal-app's Web
Serial hardware smoke.

Note on ordering: although this is Phase 4, the harness's *assertions*
should be written as each behavior is built — they're the "red" that
Phases 2 and 3 turn green. This phase consolidates them into a proper,
documented, reusable tool.

Steps:

1. `harness/loopback_test.py`: open the port (auto-detect `/dev/ttyACM*`
   or take a `--port` arg), write a known payload, assert it echoes
   byte-for-byte. Cover empty, single-byte, exact-buffer-size, and
   multi-KB payloads.
2. `harness/settings_test.py`: open with specific baud/parity/stop/data,
   send the sentinel, parse the report, assert it matches what was set.
3. `harness/README.md`: how to run, what each test proves, how the
   terminal-app reuses it.
4. Wire into a `make test` or a `harness/run.sh` so it's one command.

Commits:
- `feat(harness): loopback echo verification over pyserial`
- `feat(harness): settings round-trip verification via sentinel`
- `docs(harness): document usage and terminal-app integration`

Acceptance:
- [ ] `harness/loopback_test.py` passes against a flashed Pico
- [ ] `harness/settings_test.py` passes against a flashed Pico
- [ ] Harness exits non-zero with a clear message when no device present
- [ ] `harness/README.md` explains terminal-app reuse

---

## Phase 5 — Documentation, flashing, release

Branch: `phase/05-release`

**Goal:** Ship v0.1.0 — a documented, reproducible test rig.

Steps:

1. `README.md`: what the rig does, the behavior contract (echo +
   sentinel report), wiring (none needed beyond USB — it's a loopback
   in firmware, no external jumpers), board support, quick-start.
2. Finalize `docs/FLASHING.md`: UF2 drag-drop, picotool, and SWD via a
   debugprobe or second Pico, with the trade-offs.
3. A prebuilt `.uf2` attached to the release tag so users can flash
   without building (the whole point — "many Picos laying around" each
   flashed in seconds).
4. `CHANGELOG.md`, `LICENSE` (BSD-3-Clause to match the SDK ecosystem,
   or MIT — pick one and be consistent).
5. Tag `v0.1.0`, push.

Commits:
- `docs: write README with behavior contract and quick-start`
- `docs(flash): finalize flashing guide with SWD option`
- `chore: add CHANGELOG and LICENSE`
- `chore: build and attach release UF2`
- `chore: tag v0.1.0`

Acceptance:
- [ ] A fresh Pico can be flashed from the release UF2 and passes the
      harness without building anything
- [ ] README is enough for a new user to flash and verify in minutes
- [ ] `v0.1.0` tagged and pushed
