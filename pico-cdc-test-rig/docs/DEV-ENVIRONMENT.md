# DEV-ENVIRONMENT.md — toolchain setup (Debian 13 / RPi OS 13 Trixie)

Setting up the Pico C/C++ SDK 2.2.0 toolchain on Debian 13 (Trixie) or
Raspberry Pi OS 13 (also Trixie-based). The apt package names are
identical on both — RPi OS 13 is Debian 13 underneath — so this one
procedure covers both.

## Where to run this

The primary build/flash/test machine is the **Raspberry Pi 5**
(`<pi5-host>`) with a Pico directly attached via USB. Claude Code
runs here and can do the full cycle — build, flash, and run the host
harness — without any manual steps.

Building alone also works anywhere the toolchain installs (a laptop, a
CI VM). Flashing and hardware testing require the Pico physically
attached. See `docs/FLASHING.md`.

## 1. Install the toolchain

```bash
sudo apt update
sudo apt install -y \
    cmake \
    python3 \
    build-essential \
    ninja-build \
    gcc-arm-none-eabi \
    libnewlib-arm-none-eabi \
    libstdc++-arm-none-eabi-newlib \
    git
```

What each is for:
- `cmake` (≥ 3.13 required; Trixie ships newer) — the build system
- `ninja-build` — faster than Make; the SDK and these docs assume it
- `gcc-arm-none-eabi` — the ARM cross-compiler that targets the RP2040/RP2350
- `libnewlib-arm-none-eabi`, `libstdc++-arm-none-eabi-newlib` — the C
  and C++ standard library implementations for the bare-metal target
- `build-essential` — host compiler, needed for picotool and for the
  host-side unit tests
- `python3` — the SDK build invokes Python for some code generation

Verify the cross-compiler:

```bash
arm-none-eabi-gcc --version
cmake --version        # expect ≥ 3.13
ninja --version
```

> Trixie note: if any package name fails to resolve, check for a
> Trixie rename (`apt search <name>`). The ARM toolchain package names
> above have been stable across recent Debian releases, but Trixie did
> rename some unrelated libraries during the 64-bit time_t transition,
> so don't be surprised if you hit one elsewhere. Update this doc if so.

## 2. Clone the SDK (with submodules — this matters for USB)

TinyUSB, which provides the CDC device class this project depends on,
is a **git submodule** of the SDK. A plain clone without submodules
will compile a blink LED fine but fail the moment you add USB. Always
init submodules:

```bash
git clone --branch 2.2.0 https://github.com/raspberrypi/pico-sdk.git ~/pico-sdk
cd ~/pico-sdk
git submodule update --init        # pulls TinyUSB and other submodules
```

To pull *only* TinyUSB (faster than all submodules) if you prefer:

```bash
git submodule update --init lib/tinyusb
```

## 3. Point the build at the SDK

The SDK is located via the `PICO_SDK_PATH` environment variable. Make
it permanent:

```bash
echo 'export PICO_SDK_PATH=$HOME/pico-sdk' >> ~/.bashrc
source ~/.bashrc
echo $PICO_SDK_PATH        # confirm it's set
```

Alternatively pass it per-build: `cmake -B build -DPICO_SDK_PATH=$HOME/pico-sdk ...`.

The repo includes a `pico_sdk_import.cmake` (copied from the SDK's
`external/pico_sdk_import.cmake`) so `CMakeLists.txt` can do
`include(pico_sdk_import.cmake)` then `pico_sdk_init()`.

## 4. picotool (for flashing and inspection)

picotool loads firmware over USB and inspects binaries. It's optional
if you only ever flash by BOOTSEL drag-drop, but it makes iteration far
faster (no button juggling — `picotool load -x` reboots the Pico into
the bootloader, flashes, and runs, all from the command line if the
firmware enables `reset_usb_boot` or you use a debug interface).

On Trixie, picotool is available from apt (v2.1.1 as of June 2026 —
newer than the SDK tag but compatible):

```bash
sudo apt install -y picotool
picotool version
```

If apt doesn't have it or you need a specific version, build from source:

```bash
sudo apt install -y libusb-1.0-0-dev pkg-config
git clone --branch 2.2.0 https://github.com/raspberrypi/picotool.git ~/picotool
cd ~/picotool
cmake -B build -G Ninja        # finds the SDK via PICO_SDK_PATH
cmake --build build
sudo cmake --install build      # installs to /usr/local/bin
picotool version
```

## 5. udev rule (Linux, so picotool works without sudo)

The Raspberry Pi USB vendor ID is `2e8a`. Allow your user to access
both the BOOTSEL mass-storage mode and the running device:

```bash
sudo tee /etc/udev/rules.d/99-pico.rules >/dev/null <<'RULES'
# Raspberry Pi Pico — BOOTSEL and running device
SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", MODE="0666"
RULES
sudo udevadm control --reload-rules
sudo udevadm trigger
```

(picotool 2.x can also install its own udev rules; this explicit rule
is fine and predictable.)

## 6. Board selection

This firmware targets the original Pico (RP2040) by default. Override
`PICO_BOARD` at configure time for other boards:

```bash
cmake -B build -G Ninja -DPICO_BOARD=pico       # RP2040 (default)
cmake -B build -G Ninja -DPICO_BOARD=pico2      # RP2350
cmake -B build -G Ninja -DPICO_BOARD=pico_w     # RP2040 + wireless
cmake -B build -G Ninja -DPICO_BOARD=pico2_w    # RP2350 + wireless
```

The LED pin differs: GP25 on Pico/Pico 2, but the on-board LED on the W
variants is driven via the wireless chip (`CYW43_WL_GPIO_LED_PIN`),
which needs `pico_cyw43_arch` linked. Phase 0's blink should handle
both — use `PICO_DEFAULT_LED_PIN` where available and guard the W path.

## 7. Build sanity check

From the repo root after Phase 0 scaffolding exists:

```bash
cmake -B build -G Ninja -DPICO_BOARD=pico
cmake --build build
ls build/*.uf2          # the artifact you flash
```

A clean build producing a `.uf2` confirms the toolchain is good. If
this works on <build-host>, Claude Code can build autonomously; the `.uf2`
is then copied to the bench machine for flashing.

## 8. Optional: VS Code extension

The official Raspberry Pi Pico VS Code extension wraps all of the above
(toolchain, SDK, CMake, flashing) behind a GUI and bundles its own
toolchain so you don't need the apt packages. It works over Remote-SSH
the same way the Claude Code extension does — install it on the remote
(the Pi 5 or <build-host>), not locally. For this project the command-line
flow above is sufficient and more scriptable for Claude Code, but the
extension is a fine alternative if you prefer it for the flash step.

## Troubleshooting

- **`tinyusb` headers not found / USB build fails:** submodules weren't
  initialized. `cd ~/pico-sdk && git submodule update --init`.
- **`PICO_SDK_PATH` not set:** the CMake configure step errors early.
  `echo $PICO_SDK_PATH`; re-source `~/.bashrc`.
- **picotool can't access the device (Linux):** udev rule missing or not
  reloaded; or you need to be in the right group. Re-run the udev steps;
  unplug/replug the Pico.
- **CMake too old:** not an issue on Trixie (ships ≥ 3.25), but if you're
  on an older box, the SDK needs ≥ 3.13.
- **Wrong board LED behavior:** you built for the wrong `PICO_BOARD`.
  Reconfigure with the correct board; delete `build/` if CMake caches
  the old board.
