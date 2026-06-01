# PHASE-01-cdc-enumerate.md — USB CDC enumeration

Branch: `phase/01-cdc-enumerate`

## Goal

The Pico enumerates as a CDC-ACM device that the host OS binds as a
serial port. No echo yet — just clean enumeration. By the end, the host
has a `/dev/ttyACM*` (Linux) or COM port (Windows) that opens without
error.

See `docs/USB-CDC.md` for the descriptor and API background.

## Files to create / change

```
src/tusb_config.h          ← TinyUSB configuration
src/usb_descriptors.c      ← device / config / string descriptors
src/main.c                 ← tusb_init() + tud_task() loop (replaces blink)
CMakeLists.txt             ← link tinyusb, add include dir for tusb_config.h
```

## Step-by-step

### 1.1 — tusb_config.h

Lift the CDC example's config (`$PICO_SDK_PATH/lib/tinyusb/examples/device/cdc_msc/src/tusb_config.h`)
and pare it to CDC-only. Essentials:

```c
#define CFG_TUD_ENABLED        1
#define CFG_TUD_CDC            1
#define CFG_TUD_CDC_RX_BUFSIZE 256
#define CFG_TUD_CDC_TX_BUFSIZE 256
#define CFG_TUD_CDC_EP_BUFSIZE 64
```

Commit: `feat(usb): add tusb_config enabling CDC device class`

### 1.2 — usb_descriptors.c

Model on `$PICO_SDK_PATH/lib/tinyusb/examples/device/cdc_msc/src/usb_descriptors.c`,
stripping MSC so only CDC remains. Set:

- Device descriptor VID/PID: `0xCafe` / `0x4001` (test IDs — not a real
  vendor's). The `idVendor 0xcafe` makes it easy to spot in `lsusb`.
- Product string: `"Pico CDC Test Rig"` — shows in `lsusb -v` and the
  Web Serial port picker, so the right device is obvious.
- One configuration using `TUD_CDC_DESCRIPTOR(...)` with the example's
  default endpoints (notification 0x81, data out 0x02 / in 0x82).

Commit: `feat(usb): add CDC device, config, and string descriptors`

### 1.3 — main.c

Replace the blink loop with the USB service loop:

```c
#include "pico/stdlib.h"
#include "tusb.h"

int main(void) {
    tusb_init();
    while (true) {
        tud_task();          // service USB — must run continuously
        // echo logic comes in Phase 2
    }
}
```

Commit: `feat(usb): init TinyUSB and run device task loop`

### 1.4 — CMakeLists.txt

Link TinyUSB and make `tusb_config.h` findable:

```cmake
target_link_libraries(pico-cdc-test-rig
    pico_stdlib
    tinyusb_device
    tinyusb_board
)
target_include_directories(pico-cdc-test-rig PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/src   # so TinyUSB finds tusb_config.h
)
```

Commit: `build(usb): link tinyusb and expose tusb_config include path`

### 1.5 — Build, flash, verify enumeration

```bash
cmake --build build
# flash per docs/FLASHING.md
lsusb | grep -i cafe                 # device present with test VID
dmesg | tail                         # kernel created /dev/ttyACMx
ls /dev/ttyACM*                      # the port exists
```

On Windows: Device Manager → Ports (COM & LPT) shows the new COM port.

## Acceptance checklist

- [ ] Build clean, `.uf2` produced
- [ ] `lsusb` shows VID `0xcafe`, product string "Pico CDC Test Rig"
- [ ] OS creates `/dev/ttyACM*` / a COM port with no errors
- [ ] `dmesg` shows clean enumeration (no descriptor errors, no resets)
- [ ] Opening the port (e.g. `picocom /dev/ttyACM0`) connects (it won't
      echo yet — that's Phase 2 — but the port opens)
- [ ] Branch merged to `main`

## Notes

- If enumeration fails or the device keeps resetting in `dmesg`, the
  usual cause is a malformed config descriptor (wrong total length, or
  endpoint number collision). Diff yours against the example.
- `tud_task()` must be called frequently. If you accidentally left a
  `sleep_ms` in the loop from the blink phase, enumeration becomes
  flaky — remove blocking calls.
