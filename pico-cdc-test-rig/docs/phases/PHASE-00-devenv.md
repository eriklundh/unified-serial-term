# PHASE-00-devenv.md — Dev environment and blink

Branch: `phase/00-devenv-blink`

## Goal

Prove the entire toolchain → build → flash → run chain works by
blinking the onboard LED. No USB yet. If blink works, the foundation is
solid and every later phase is incremental.

## Prerequisites

Toolchain installed per `docs/DEV-ENVIRONMENT.md` (§1–§3 minimum:
toolchain packages, SDK cloned with submodules, `PICO_SDK_PATH` set).
Confirm:

```bash
arm-none-eabi-gcc --version
echo $PICO_SDK_PATH        # must be set
ls $PICO_SDK_PATH/lib/tinyusb/src/tusb.h   # submodules initialized
```

## Files to create

```
CMakeLists.txt
pico_sdk_import.cmake      ← copied from $PICO_SDK_PATH/external/
src/main.c
.gitignore                 ← build/, *.uf2 in working dirs
```

## Step-by-step

### 0.1 — pico_sdk_import.cmake

Copy it from the SDK so the project can locate and initialize the SDK:

```bash
cp $PICO_SDK_PATH/external/pico_sdk_import.cmake .
```

Commit: `chore(proj): vendor pico_sdk_import.cmake from SDK`

### 0.2 — CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.13)

# Must come before project()
include(pico_sdk_import.cmake)

project(pico-cdc-test-rig C CXX ASM)

pico_sdk_init()

add_executable(pico-cdc-test-rig
    src/main.c
)

target_link_libraries(pico-cdc-test-rig
    pico_stdlib
)

# Produce .uf2, .bin, .hex, .dis alongside the .elf
pico_add_extra_outputs(pico-cdc-test-rig)
```

Commit: `chore(cmake): scaffold project against pico-sdk 2.2.0`

### 0.3 — src/main.c (blink)

```c
#include "pico/stdlib.h"

int main(void) {
#ifdef PICO_DEFAULT_LED_PIN
    const uint LED = PICO_DEFAULT_LED_PIN;
    gpio_init(LED);
    gpio_set_dir(LED, GPIO_OUT);
    while (true) {
        gpio_put(LED, 1);
        sleep_ms(250);
        gpio_put(LED, 0);
        sleep_ms(250);
    }
#else
    // Pico W / Pico 2 W drive the LED via the wireless chip; handle in
    // a follow-up if targeting those boards. For PICO_BOARD=pico this
    // branch is not compiled.
    while (true) { tight_loop_contents(); }
#endif
}
```

Commit: `feat(proj): blink onboard LED to validate toolchain`

> Pico W / Pico 2 W note: those boards don't define
> `PICO_DEFAULT_LED_PIN` — the LED hangs off the CYW43 chip. If you're
> targeting a W board, link `pico_cyw43_arch_none` and use
> `cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, ...)`. For the default
> `PICO_BOARD=pico` this isn't needed.

### 0.4 — Build

```bash
cmake -B build -G Ninja -DPICO_BOARD=pico
cmake --build build
ls build/pico-cdc-test-rig.uf2
```

If this produces a `.uf2`, the toolchain is good. **This step is what
Claude Code on <build-host> can verify autonomously** — no hardware needed
to confirm the build chain.

Commit (if any build-config tweaks were needed): `build: confirm clean
uf2 output with ninja`

### 0.5 — Flash and verify (needs a Pico)

Per `docs/FLASHING.md` Method 1: hold BOOTSEL, plug in, drag the UF2
onto `RPI-RP2`. The LED should blink at ~2 Hz.

This is the hardware step — done on the bench machine (Pi 5 or laptop),
not on the headless VM.

## Acceptance checklist

- [ ] `cmake --build build` produces `build/pico-cdc-test-rig.uf2`
- [ ] No warnings-as-errors in the build
- [ ] Flashed Pico blinks at ~2 Hz
- [ ] `docs/DEV-ENVIRONMENT.md` updated if the apt set or any step
      differed from what's documented
- [ ] Branch merged to `main`

## Why blink first

It isolates variables. If USB enumeration fails in Phase 1, you already
know the toolchain, CMake config, SDK path, and flash process are all
good — so the problem is specifically USB, not the foundation. Skipping
blink means debugging the whole stack at once when the first USB attempt
doesn't enumerate.
